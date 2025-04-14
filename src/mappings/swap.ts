import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { log } from '@graphprotocol/graph-ts'

import { Swap as SwapEvent } from '../types/PoolManager/PoolManager'
import { Bundle, Hook, HookUser, Pool, PoolManager, PoolUser, Stats, Swap, Token } from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ONE_BI, ZERO_BD } from '../utils/constants'
import { convertTokenToDecimal, loadTransaction, safeDiv } from '../utils/index'
import {
  updatePoolDayData,
  updatePoolHourData,
  updatePoolMinuteData,
  updateTokenDayData,
  updateTokenHourData,
  updateTokenMinuteData,
  updateUniswapDayData,
} from '../utils/intervalUpdates'
import {
  findNativePerToken,
  getNativePriceInUSD,
  getTrackedAmountUSD,
  sqrtPriceX96ToTokenPrices,
} from '../utils/pricing'

export function handleSwap(event: SwapEvent): void {
  handleSwapHelper(event)
}

export function handleSwapHelper(event: SwapEvent, subgraphConfig: SubgraphConfig = getSubgraphConfig()): void {
  const poolManagerAddress = subgraphConfig.poolManagerAddress
  const stablecoinWrappedNativePoolId = subgraphConfig.stablecoinWrappedNativePoolId
  const stablecoinIsToken0 = subgraphConfig.stablecoinIsToken0
  const wrappedNativeAddress = subgraphConfig.wrappedNativeAddress
  const stablecoinAddresses = subgraphConfig.stablecoinAddresses
  const minimumNativeLocked = subgraphConfig.minimumNativeLocked
  const whitelistTokens = subgraphConfig.whitelistTokens
  const nativeTokenDetails = subgraphConfig.nativeTokenDetails

  const bundle = Bundle.load('1')!
  const poolManager = PoolManager.load(poolManagerAddress)!
  const poolId = event.params.id.toHexString()
  const pool = Pool.load(poolId)!
  const hook = Hook.load(pool.hooks)!
  const stats = Stats.load('stats')!
  // if the pool user does not exist, create a new one
  let poolUser = PoolUser.load(pool.id + '-' + event.params.sender.toHexString())
  if (!poolUser) {
    poolUser = new PoolUser(pool.id + '-' + event.params.sender.toHexString())
    poolUser.pool = pool.id
    poolUser.user = event.params.sender
    poolUser.firstInteractionTimestamp = event.block.timestamp
    pool.uniqueUserCount = pool.uniqueUserCount.plus(ONE_BI)
  }

  let hookUser = HookUser.load(hook.id + '-' + pool.id + '-' + event.params.sender.toHexString())
  if (!hookUser) {
    hookUser = new HookUser(hook.id + '-' + pool.id + '-' + event.params.sender.toHexString())
    hookUser.hook = hook.id
    hookUser.user = event.params.sender
    hookUser.firstInteractionTimestamp = event.block.timestamp
    hook.uniqueUserCount = hook.uniqueUserCount.plus(ONE_BI)
    stats.totalHookUniqueUserCount = stats.totalHookUniqueUserCount.plus(ONE_BI)
  }

  const token0 = Token.load(pool.token0)
  const token1 = Token.load(pool.token1)

  if (token0 && token1) {
    // amounts - 0/1 are token deltas: can be positive or negative
    // Unlike V3, a negative amount represents that amount is being sent to the pool and vice versa, so invert the sign
    const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals).times(BigDecimal.fromString('-1'))
    const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals).times(BigDecimal.fromString('-1'))

    // need absolute amounts for volume
    let amount0Abs = amount0
    if (amount0.lt(ZERO_BD)) {
      amount0Abs = amount0.times(BigDecimal.fromString('-1'))
    }
    let amount1Abs = amount1
    if (amount1.lt(ZERO_BD)) {
      amount1Abs = amount1.times(BigDecimal.fromString('-1'))
    }

    const amount0ETH = amount0Abs.times(token0.derivedETH)
    const amount1ETH = amount1Abs.times(token1.derivedETH)
    const amount0USD = amount0ETH.times(bundle.ethPriceUSD)
    const amount1USD = amount1ETH.times(bundle.ethPriceUSD)

    // get amount that should be tracked only - div 2 because cant count both input and output as volume
    const amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0, amount1Abs, token1, whitelistTokens).div(
      BigDecimal.fromString('2'),
    )
    const amountTotalETHTracked = safeDiv(amountTotalUSDTracked, bundle.ethPriceUSD)
    const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(BigDecimal.fromString('2'))

    const feesETH = amountTotalETHTracked.times(pool.feeTier.toBigDecimal()).div(BigDecimal.fromString('1000000'))
    const feesUSD = amountTotalUSDTracked.times(pool.feeTier.toBigDecimal()).div(BigDecimal.fromString('1000000'))

    // global updates
    poolManager.txCount = poolManager.txCount.plus(ONE_BI)
    poolManager.totalVolumeETH = poolManager.totalVolumeETH.plus(amountTotalETHTracked)
    poolManager.totalVolumeUSD = poolManager.totalVolumeUSD.plus(amountTotalUSDTracked)
    poolManager.untrackedVolumeUSD = poolManager.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
    poolManager.totalFeesETH = poolManager.totalFeesETH.plus(feesETH)
    poolManager.totalFeesUSD = poolManager.totalFeesUSD.plus(feesUSD)

    // reset aggregate tvl before individual pool tvl updates
    const currentPoolTvlETH = pool.totalValueLockedETH
    poolManager.totalValueLockedETH = poolManager.totalValueLockedETH.minus(currentPoolTvlETH)

    // pool volume
    pool.volumeToken0 = pool.volumeToken0.plus(amount0Abs)
    pool.volumeToken1 = pool.volumeToken1.plus(amount1Abs)
    pool.volumeUSD = pool.volumeUSD.plus(amountTotalUSDTracked)
    pool.untrackedVolumeUSD = pool.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
    pool.feesUSD = pool.feesUSD.plus(feesUSD)
    pool.txCount = pool.txCount.plus(ONE_BI)

    // hook volume
    hook.volumeUSD = hook.volumeUSD.plus(amountTotalUSDTracked)
    hook.feesUSD = hook.feesUSD.plus(feesUSD)
    hook.tradingVolumeUSD = hook.tradingVolumeUSD.plus(amountTotalUSDTracked)
    hook.untrackedTradingVolumeUSD = hook.untrackedTradingVolumeUSD.plus(amountTotalUSDUntracked)

    // stats
    stats.totalHookVolumeUSD = stats.totalHookVolumeUSD.plus(amountTotalUSDTracked)
    stats.totalHookFeesUSD = stats.totalHookFeesUSD.plus(feesUSD)
    stats.totalHookTradingVolumeUSD = stats.totalHookTradingVolumeUSD.plus(amountTotalUSDTracked)
    stats.totalHookUntrackedTradingVolumeUSD = stats.totalHookUntrackedTradingVolumeUSD.plus(amountTotalUSDUntracked)

    // Update the pool with the new active liquidity, price, and tick.
    pool.liquidity = event.params.liquidity
    pool.tick = BigInt.fromI32(event.params.tick as i32)
    pool.sqrtPrice = event.params.sqrtPriceX96
    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)

    // update token0 data
    token0.volume = token0.volume.plus(amount0Abs)
    token0.totalValueLocked = token0.totalValueLocked.plus(amount0)
    token0.volumeUSD = token0.volumeUSD.plus(amountTotalUSDTracked)
    token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
    token0.feesUSD = token0.feesUSD.plus(feesUSD)
    token0.txCount = token0.txCount.plus(ONE_BI)

    // update token1 data
    token1.volume = token1.volume.plus(amount1Abs)
    token1.totalValueLocked = token1.totalValueLocked.plus(amount1)
    token1.volumeUSD = token1.volumeUSD.plus(amountTotalUSDTracked)
    token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
    token1.feesUSD = token1.feesUSD.plus(feesUSD)
    token1.txCount = token1.txCount.plus(ONE_BI)

    // updated pool ratess
    const prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0, token1, nativeTokenDetails)
    pool.token0Price = prices[0]
    pool.token1Price = prices[1]
    pool.save()

    // update USD pricing
    bundle.ethPriceUSD = getNativePriceInUSD(stablecoinWrappedNativePoolId, stablecoinIsToken0)

    bundle.save()
    token0.derivedETH = findNativePerToken(token0, wrappedNativeAddress, stablecoinAddresses, minimumNativeLocked)
    token1.derivedETH = findNativePerToken(token1, wrappedNativeAddress, stablecoinAddresses, minimumNativeLocked)

    const txHash = 'tx: ' + event.transaction.hash.toHexString().slice(0, 8)
    log.debug('vikkko {} - pool.id: {}', [txHash, pool.id])
    log.debug('vikkko {} - hook.id: {}', [txHash, hook.id])
    log.debug('vikkko {} - hook.totalValueLockedETH 0: {}', [txHash, hook.totalValueLockedETH.toString()])
    log.debug('vikkko {} - pool.totalValueLockedETH 0: {}', [txHash, pool.totalValueLockedETH.toString()])
    hook.totalValueLockedETH = hook.totalValueLockedETH.minus(pool.totalValueLockedETH)

    log.debug('vikkko {} - hook.totalValueLockedETH 1: {}', [txHash, hook.totalValueLockedETH.toString()])
    log.debug('vikkko {} - stats.totalHookValueLockedETH 0: {}', [txHash, stats.totalHookValueLockedETH.toString()])
    stats.totalHookValueLockedETH = stats.totalHookValueLockedETH.minus(pool.totalValueLockedETH)
    log.debug('vikkko {} - stats.totalHookValueLockedETH 1: {}', [txHash, stats.totalHookValueLockedETH.toString()])

    if (hook.totalValueLockedETH.lt(ZERO_BD) || stats.totalHookValueLockedETH.lt(ZERO_BD)) {
      log.error('vikkko swap {} - hook.totalValueLockedETH: {}', [txHash, hook.totalValueLockedETH.toString()])
    }

    /**
     * Things afffected by new USD rates
     */
    pool.totalValueLockedETH = pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH))
    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD)

    poolManager.totalValueLockedETH = poolManager.totalValueLockedETH.plus(pool.totalValueLockedETH)
    poolManager.totalValueLockedUSD = poolManager.totalValueLockedETH.times(bundle.ethPriceUSD)

    log.debug('vikkko {} - pool.totalValueLockedETH 1: {}', [txHash, pool.totalValueLockedETH.toString()])
    // hook total value locked
    hook.totalValueLockedETH = hook.totalValueLockedETH.plus(pool.totalValueLockedETH)
    log.debug('vikkko {} - hook.totalValueLockedETH 2: {}', [txHash, hook.totalValueLockedETH.toString()])
    hook.totalValueLockedUSD = hook.totalValueLockedETH.times(bundle.ethPriceUSD)

    stats.totalHookValueLockedETH = stats.totalHookValueLockedETH.plus(pool.totalValueLockedETH)
    log.debug('vikkko {} - stats.totalHookValueLockedETH 2: {}', [txHash, stats.totalHookValueLockedETH.toString()])
    stats.totalHookValueLockedUSD = stats.totalHookValueLockedETH.times(bundle.ethPriceUSD)

    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH).times(bundle.ethPriceUSD)
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH).times(bundle.ethPriceUSD)

    // create Swap event
    const transaction = loadTransaction(event)
    const swap = new Swap(transaction.id + '-' + event.logIndex.toString())
    swap.transaction = transaction.id
    swap.timestamp = transaction.timestamp
    swap.pool = pool.id
    swap.token0 = pool.token0
    swap.token1 = pool.token1
    swap.sender = event.params.sender
    swap.origin = event.transaction.from
    swap.amount0 = amount0
    swap.amount1 = amount1
    swap.amountUSD = amountTotalUSDTracked
    swap.tick = BigInt.fromI32(event.params.tick as i32)
    swap.sqrtPriceX96 = event.params.sqrtPriceX96
    swap.logIndex = event.logIndex

    // interval data
    const uniswapDayData = updateUniswapDayData(event, poolManagerAddress)
    const poolDayData = updatePoolDayData(event.params.id.toHexString(), event)
    const poolHourData = updatePoolHourData(event.params.id.toHexString(), event)
    const poolMinuteData = updatePoolMinuteData(event.params.id.toHexString(), event)
    const token0DayData = updateTokenDayData(token0, event)
    const token1DayData = updateTokenDayData(token1, event)
    const token0MinuteData = updateTokenMinuteData(token0, event)
    const token0HourData = updateTokenHourData(token0, event)
    const token1HourData = updateTokenHourData(token1, event)
    const token1MinuteData = updateTokenMinuteData(token1, event)

    // update volume metrics
    uniswapDayData.volumeETH = uniswapDayData.volumeETH.plus(amountTotalETHTracked)
    uniswapDayData.volumeUSD = uniswapDayData.volumeUSD.plus(amountTotalUSDTracked)
    uniswapDayData.feesUSD = uniswapDayData.feesUSD.plus(feesUSD)

    poolDayData.volumeUSD = poolDayData.volumeUSD.plus(amountTotalUSDTracked)
    poolDayData.volumeToken0 = poolDayData.volumeToken0.plus(amount0Abs)
    poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(amount1Abs)
    poolDayData.feesUSD = poolDayData.feesUSD.plus(feesUSD)

    poolHourData.volumeUSD = poolHourData.volumeUSD.plus(amountTotalUSDTracked)
    poolHourData.volumeToken0 = poolHourData.volumeToken0.plus(amount0Abs)
    poolHourData.volumeToken1 = poolHourData.volumeToken1.plus(amount1Abs)
    poolHourData.feesUSD = poolHourData.feesUSD.plus(feesUSD)

    poolMinuteData.volumeUSD = poolMinuteData.volumeUSD.plus(amountTotalUSDTracked)
    poolMinuteData.volumeToken0 = poolMinuteData.volumeToken0.plus(amount0Abs)
    poolMinuteData.volumeToken1 = poolMinuteData.volumeToken1.plus(amount1Abs)
    poolMinuteData.feesUSD = poolMinuteData.feesUSD.plus(feesUSD)

    token0DayData.volume = token0DayData.volume.plus(amount0Abs)
    token0DayData.volumeUSD = token0DayData.volumeUSD.plus(amountTotalUSDTracked)
    token0DayData.untrackedVolumeUSD = token0DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
    token0DayData.feesUSD = token0DayData.feesUSD.plus(feesUSD)

    token0HourData.volume = token0HourData.volume.plus(amount0Abs)
    token0HourData.volumeUSD = token0HourData.volumeUSD.plus(amountTotalUSDTracked)
    token0HourData.untrackedVolumeUSD = token0HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
    token0HourData.feesUSD = token0HourData.feesUSD.plus(feesUSD)

    token0MinuteData.volume = token0MinuteData.volume.plus(amount0Abs)
    token0MinuteData.volumeUSD = token0MinuteData.volumeUSD.plus(amountTotalUSDTracked)
    token0MinuteData.untrackedVolumeUSD = token0MinuteData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
    token0MinuteData.feesUSD = token0MinuteData.feesUSD.plus(feesUSD)

    token1DayData.volume = token1DayData.volume.plus(amount1Abs)
    token1DayData.volumeUSD = token1DayData.volumeUSD.plus(amountTotalUSDTracked)
    token1DayData.untrackedVolumeUSD = token1DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
    token1DayData.feesUSD = token1DayData.feesUSD.plus(feesUSD)

    token1HourData.volume = token1HourData.volume.plus(amount1Abs)
    token1HourData.volumeUSD = token1HourData.volumeUSD.plus(amountTotalUSDTracked)
    token1HourData.untrackedVolumeUSD = token1HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
    token1HourData.feesUSD = token1HourData.feesUSD.plus(feesUSD)

    token1MinuteData.volume = token1MinuteData.volume.plus(amount1Abs)
    token1MinuteData.volumeUSD = token1MinuteData.volumeUSD.plus(amountTotalUSDTracked)
    token1MinuteData.untrackedVolumeUSD = token1MinuteData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
    token1MinuteData.feesUSD = token1MinuteData.feesUSD.plus(feesUSD)

    swap.save()
    token0DayData.save()
    token1DayData.save()
    uniswapDayData.save()
    poolDayData.save()
    poolHourData.save()
    poolMinuteData.save()
    token0HourData.save()
    token1HourData.save()
    token0MinuteData.save()
    token1MinuteData.save()
    poolManager.save()
    pool.save()
    token0.save()
    token1.save()
    hook.save()
    hookUser.save()
    poolUser.save()
  }
}
