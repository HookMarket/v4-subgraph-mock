import { BigInt, log } from '@graphprotocol/graph-ts'
import { log } from '@graphprotocol/graph-ts'

import { ModifyLiquidity as ModifyLiquidityEvent } from '../types/PoolManager/PoolManager'
import {
  Bundle,
  Hook,
  HookUser,
  ModifyLiquidity,
  Pool,
  PoolManager,
  PoolUser,
  Stats,
  Tick,
  Token,
} from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ONE_BI, ZERO_BD, ZERO_BI } from '../utils/constants'
import { convertTokenToDecimal, loadTransaction } from '../utils/index'
import {
  updateHookDayData,
  updatePoolDayData,
  updatePoolHourData,
  updatePoolMinuteData,
  updateStatsDayData,
  updateTokenDayData,
  updateTokenHourData,
  updateTokenMinuteData,
  updateUniswapDayData,
} from '../utils/intervalUpdates'
import { getAmount0, getAmount1 } from '../utils/liquidityMath/liquidityAmounts'
import { calculateAmountUSD } from '../utils/pricing'
import { createTick } from '../utils/tick'

export function handleModifyLiquidity(event: ModifyLiquidityEvent): void {
  handleModifyLiquidityHelper(event)
}

export function handleModifyLiquidityHelper(
  event: ModifyLiquidityEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const poolManagerAddress = subgraphConfig.poolManagerAddress

  const bundle = Bundle.load('1')!
  const poolId = event.params.id.toHexString()
  const pool = Pool.load(poolId)!
  const poolManager = PoolManager.load(poolManagerAddress)
  log.debug('vikkko modifyLiquidityHelper {} - pool.hooks: {}', [poolId, pool.hooks])
  const hook = Hook.load(pool.hooks)!
  log.debug('vikkko modifyLiquidityHelper {} - hook.createdAtTimestamp: {}', [
    poolId,
    hook.createdAtTimestamp.toString(),
  ])
  const stats =
    hook.id === '0x0000000000000000000000000000000000000000' ? Stats.load('statszero')! : Stats.load('stats')!

  if (pool === null) {
    log.debug('handleModifyLiquidityHelper: pool not found {}', [poolId])
    return
  }

  if (poolManager === null) {
    log.debug('handleModifyLiquidityHelper: pool manager not found {}', [poolManagerAddress])
    return
  }

  // if the pool user does not exist, create a new one
  let poolUser = PoolUser.load(pool.id + '-' + event.params.sender.toHexString())
  let hookUser = HookUser.load(hook.id + '-' + event.params.sender.toHexString())

  if (!poolUser) {
    poolUser = new PoolUser(pool.id + '-' + event.params.sender.toHexString())
    poolUser.pool = pool.id
    poolUser.user = event.params.sender
    poolUser.firstInteractionTimestamp = event.block.timestamp
    poolUser.totalValueLockedToken0 = ZERO_BD
    poolUser.totalValueLockedToken1 = ZERO_BD
    pool.uniqueUserCount = pool.uniqueUserCount.plus(ONE_BI)
  }

  if (!hookUser) {
    hookUser = new HookUser(hook.id + '-' + event.params.sender.toHexString())
    hookUser.hook = hook.id
    hookUser.user = event.params.sender
    hookUser.uniqueUserPoolCount = ZERO_BI
    hookUser.firstInteractionTimestamp = event.block.timestamp
    hook.uniqueUserCount = hook.uniqueUserCount.plus(ONE_BI)
    stats.totalHookUniqueUserCount = stats.totalHookUniqueUserCount.plus(ONE_BI)
  }

  if (poolUser.totalValueLockedToken0.equals(ZERO_BD) && poolUser.totalValueLockedToken1.equals(ZERO_BD)) {
    pool.uniqueLiquidityProviderCount = pool.uniqueLiquidityProviderCount.plus(ONE_BI)
    if (hookUser.uniqueUserPoolCount.equals(ZERO_BI)) {
      hook.uniqueLiquidityProviderCount = hook.uniqueLiquidityProviderCount.plus(ONE_BI)
    }
    hookUser.uniqueUserPoolCount = hookUser.uniqueUserPoolCount.plus(ONE_BI)
  }

  const token0 = Token.load(pool.token0)
  const token1 = Token.load(pool.token1)

  if (token0 && token1) {
    const currTick: i32 = pool.tick!.toI32()
    const currSqrtPriceX96 = pool.sqrtPrice

    // Get the amounts using the getAmounts function
    const amount0Raw = getAmount0(
      event.params.tickLower,
      event.params.tickUpper,
      currTick,
      event.params.liquidityDelta,
      currSqrtPriceX96,
    )
    const amount1Raw = getAmount1(
      event.params.tickLower,
      event.params.tickUpper,
      currTick,
      event.params.liquidityDelta,
      currSqrtPriceX96,
    )
    const amount0 = convertTokenToDecimal(amount0Raw, token0.decimals)
    const amount1 = convertTokenToDecimal(amount1Raw, token1.decimals)

    const amountUSD = calculateAmountUSD(amount0, amount1, token0.derivedETH, token1.derivedETH, bundle.ethPriceUSD)

    if (hook.totalValueLockedETH.gt(stats.totalHookValueLockedETH)) {
      log.error('vikkko modifyLiquidity 0 - hook.totalValueLockedETH: {}', [hook.totalValueLockedETH.toString()])
      log.error('vikkko modifyLiquidity 0 - stats.totalHookValueLockedETH: {}', [
        stats.totalHookValueLockedETH.toString(),
      ])
      log.error('vikkko modifyLiquidity 0 - pool.totalValueLockedETH: {}', [pool.totalValueLockedETH.toString()])
    }

    // reset tvl aggregates until new amounts calculated
    poolManager.totalValueLockedETH = poolManager.totalValueLockedETH.minus(pool.totalValueLockedETH)
    hook.totalValueLockedETH = hook.totalValueLockedETH.minus(pool.totalValueLockedETH)
    stats.totalHookValueLockedETH = stats.totalHookValueLockedETH.minus(pool.totalValueLockedETH)

    if (hook.totalValueLockedETH.lt(ZERO_BD) || stats.totalHookValueLockedETH.lt(ZERO_BD)) {
      log.error('vikkko modifyLiquidity 1 - hook.totalValueLockedETH: {}', [hook.totalValueLockedETH.toString()])
      log.error('vikkko modifyLiquidity 1 - stats.totalHookValueLockedETH: {}', [
        stats.totalHookValueLockedETH.toString(),
      ])
      log.error('vikkko modifyLiquidity 1 - pool.totalValueLockedETH: {}', [pool.totalValueLockedETH.toString()])
    }

    // update globals
    poolManager.txCount = poolManager.txCount.plus(ONE_BI)

    // update token0 data
    token0.txCount = token0.txCount.plus(ONE_BI)
    token0.totalValueLocked = token0.totalValueLocked.plus(amount0)
    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD))

    // update token1 data
    token1.txCount = token1.txCount.plus(ONE_BI)
    token1.totalValueLocked = token1.totalValueLocked.plus(amount1)
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD))

    // pool data
    pool.txCount = pool.txCount.plus(ONE_BI)

    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it if the new position includes the current tick.
    if (
      pool.tick !== null &&
      BigInt.fromI32(event.params.tickLower).le(pool.tick as BigInt) &&
      BigInt.fromI32(event.params.tickUpper).gt(pool.tick as BigInt)
    ) {
      pool.liquidity = pool.liquidity.plus(event.params.liquidityDelta)
    }

    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)
    pool.totalValueLockedETH = pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH))
    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD)

    poolUser.totalValueLockedToken0 = poolUser.totalValueLockedToken0.plus(amount0)
    poolUser.totalValueLockedToken1 = poolUser.totalValueLockedToken1.plus(amount1)
    if (poolUser.totalValueLockedToken0.le(ZERO_BD) && poolUser.totalValueLockedToken1.le(ZERO_BD)) {
      pool.uniqueLiquidityProviderCount = pool.uniqueLiquidityProviderCount.minus(ONE_BI)
      hookUser.uniqueUserPoolCount = hookUser.uniqueUserPoolCount.minus(ONE_BI)
      if (hookUser.uniqueUserPoolCount.le(ZERO_BI)) {
        hook.uniqueLiquidityProviderCount = hook.uniqueLiquidityProviderCount.minus(ONE_BI)
      }
    }

    // reset aggregates with new amounts
    poolManager.totalValueLockedETH = poolManager.totalValueLockedETH.plus(pool.totalValueLockedETH)
    poolManager.totalValueLockedUSD = poolManager.totalValueLockedETH.times(bundle.ethPriceUSD)

    hook.totalValueLockedETH = hook.totalValueLockedETH.plus(pool.totalValueLockedETH)
    hook.totalValueLockedUSD = hook.totalValueLockedETH.times(bundle.ethPriceUSD)

    stats.totalHookValueLockedETH = stats.totalHookValueLockedETH.plus(pool.totalValueLockedETH)
    stats.totalHookValueLockedUSD = stats.totalHookValueLockedETH.times(bundle.ethPriceUSD)

    const transaction = loadTransaction(event)
    const modifyLiquidity = new ModifyLiquidity(transaction.id.toString() + '-' + event.logIndex.toString())
    modifyLiquidity.transaction = transaction.id
    modifyLiquidity.timestamp = transaction.timestamp
    modifyLiquidity.pool = pool.id
    modifyLiquidity.token0 = pool.token0
    modifyLiquidity.token1 = pool.token1
    modifyLiquidity.sender = event.params.sender
    modifyLiquidity.origin = event.transaction.from
    modifyLiquidity.amount = event.params.liquidityDelta
    modifyLiquidity.amount0 = amount0
    modifyLiquidity.amount1 = amount1
    modifyLiquidity.amountUSD = amountUSD
    modifyLiquidity.tickLower = BigInt.fromI32(event.params.tickLower)
    modifyLiquidity.tickUpper = BigInt.fromI32(event.params.tickUpper)
    modifyLiquidity.logIndex = event.logIndex

    // tick entities
    const lowerTickIdx = event.params.tickLower
    const upperTickIdx = event.params.tickUpper

    const lowerTickId = poolId + '#' + BigInt.fromI32(event.params.tickLower).toString()
    const upperTickId = poolId + '#' + BigInt.fromI32(event.params.tickUpper).toString()

    let lowerTick = Tick.load(lowerTickId)
    let upperTick = Tick.load(upperTickId)

    if (lowerTick === null) {
      lowerTick = createTick(lowerTickId, lowerTickIdx, pool.id, event)
    }

    if (upperTick === null) {
      upperTick = createTick(upperTickId, upperTickIdx, pool.id, event)
    }

    const amount = event.params.liquidityDelta
    lowerTick.liquidityGross = lowerTick.liquidityGross.plus(amount)
    lowerTick.liquidityNet = lowerTick.liquidityNet.plus(amount)
    upperTick.liquidityGross = upperTick.liquidityGross.plus(amount)
    upperTick.liquidityNet = upperTick.liquidityNet.minus(amount)

    lowerTick.save()
    upperTick.save()

    lowerTick.save()
    upperTick.save()

    updateHookDayData(hook, event)
    updateStatsDayData(stats, event)
    updateUniswapDayData(event, poolManagerAddress)
    updatePoolDayData(event.params.id.toHexString(), event)
    updatePoolHourData(event.params.id.toHexString(), event)
    updatePoolMinuteData(event.params.id.toHexString(), event)
    updateTokenDayData(token0, event)
    updateTokenDayData(token1, event)
    updateTokenHourData(token0, event)
    updateTokenHourData(token1, event)
    updateTokenMinuteData(token0, event)
    updateTokenMinuteData(token1, event)

    token0.save()
    token1.save()
    pool.save()
    poolManager.save()
    modifyLiquidity.save()
    hook.save()
    stats.save()
    hookUser.save()
    poolUser.save()
  }
}
