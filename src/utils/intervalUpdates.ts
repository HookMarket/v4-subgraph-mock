import { ethereum } from '@graphprotocol/graph-ts'

import {
  Bundle,
  Hook,
  HookDayData,
  Pool,
  PoolDayData,
  PoolHourData,
  PoolManager,
  PoolMinuteData,
  Stats,
  StatsDayData,
  Token,
  TokenDayData,
  TokenHourData,
  TokenMinuteData,
  UniswapDayData,
} from './../types/schema'
import { ONE_BI, ZERO_BD, ZERO_BI } from './constants'

/**
 * Tracks global aggregate data over daily windows
 * @param event
 */
export function updateUniswapDayData(event: ethereum.Event, poolId: string): UniswapDayData {
  const uniswap = PoolManager.load(poolId)!
  const timestamp = event.block.timestamp.toI32()
  const dayID = timestamp / 86400 // rounded
  const dayStartTimestamp = dayID * 86400
  let uniswapDayData = UniswapDayData.load(dayID.toString())
  if (uniswapDayData === null) {
    uniswapDayData = new UniswapDayData(dayID.toString())
    uniswapDayData.date = dayStartTimestamp
    uniswapDayData.volumeETH = ZERO_BD
    uniswapDayData.volumeUSD = ZERO_BD
    uniswapDayData.volumeUSDUntracked = ZERO_BD
    uniswapDayData.feesUSD = ZERO_BD
  }
  uniswapDayData.tvlUSD = uniswap.totalValueLockedUSD
  uniswapDayData.txCount = uniswap.txCount
  uniswapDayData.save()
  return uniswapDayData as UniswapDayData
}

export function updatePoolDayData(poolId: string, event: ethereum.Event): PoolDayData {
  const timestamp = event.block.timestamp.toI32()
  const dayID = timestamp / 86400
  const dayStartTimestamp = dayID * 86400
  const dayPoolID = poolId.concat('-').concat(dayID.toString())
  const pool = Pool.load(poolId)!
  let poolDayData = PoolDayData.load(dayPoolID)
  if (poolDayData === null) {
    poolDayData = new PoolDayData(dayPoolID)
    poolDayData.date = dayStartTimestamp
    poolDayData.pool = pool.id
    poolDayData.volumeToken0 = ZERO_BD
    poolDayData.volumeToken1 = ZERO_BD
    poolDayData.volumeUSD = ZERO_BD
    poolDayData.feesUSD = ZERO_BD
    poolDayData.txCount = ZERO_BI
    poolDayData.uniqueUserCount = ZERO_BI
    poolDayData.uniqueLiquidityProviderCount = ZERO_BI
    poolDayData.open = pool.token0Price
    poolDayData.high = pool.token0Price
    poolDayData.low = pool.token0Price
    poolDayData.close = pool.token0Price
  }

  if (pool.token0Price.gt(poolDayData.high)) {
    poolDayData.high = pool.token0Price
  }
  if (pool.token0Price.lt(poolDayData.low)) {
    poolDayData.low = pool.token0Price
  }

  poolDayData.liquidity = pool.liquidity
  poolDayData.sqrtPrice = pool.sqrtPrice
  poolDayData.token0Price = pool.token0Price
  poolDayData.token1Price = pool.token1Price
  poolDayData.close = pool.token0Price
  poolDayData.tick = pool.tick
  poolDayData.tvlUSD = pool.totalValueLockedUSD
  poolDayData.txCount = poolDayData.txCount.plus(ONE_BI)
  poolDayData.uniqueUserCount = pool.uniqueUserCount
  poolDayData.uniqueLiquidityProviderCount = pool.uniqueLiquidityProviderCount
  poolDayData.save()

  return poolDayData as PoolDayData
}

export function updatePoolHourData(poolId: string, event: ethereum.Event): PoolHourData {
  const timestamp = event.block.timestamp.toI32()
  const hourIndex = timestamp / 3600 // get unique hour within unix history
  const hourStartUnix = hourIndex * 3600 // want the rounded effect
  const hourPoolID = poolId.concat('-').concat(hourIndex.toString())
  const pool = Pool.load(poolId)!
  let poolHourData = PoolHourData.load(hourPoolID)
  if (poolHourData === null) {
    poolHourData = new PoolHourData(hourPoolID)
    poolHourData.periodStartUnix = hourStartUnix
    poolHourData.pool = pool.id
    poolHourData.volumeToken0 = ZERO_BD
    poolHourData.volumeToken1 = ZERO_BD
    poolHourData.volumeUSD = ZERO_BD
    poolHourData.txCount = ZERO_BI
    poolHourData.feesUSD = ZERO_BD
    poolHourData.open = pool.token0Price
    poolHourData.high = pool.token0Price
    poolHourData.low = pool.token0Price
    poolHourData.close = pool.token0Price
  }

  if (pool.token0Price.gt(poolHourData.high)) {
    poolHourData.high = pool.token0Price
  }
  if (pool.token0Price.lt(poolHourData.low)) {
    poolHourData.low = pool.token0Price
  }

  poolHourData.liquidity = pool.liquidity
  poolHourData.sqrtPrice = pool.sqrtPrice
  poolHourData.token0Price = pool.token0Price
  poolHourData.token1Price = pool.token1Price
  poolHourData.close = pool.token0Price
  poolHourData.tick = pool.tick
  poolHourData.tvlUSD = pool.totalValueLockedUSD
  poolHourData.txCount = poolHourData.txCount.plus(ONE_BI)
  poolHourData.save()

  // test
  return poolHourData as PoolHourData
}

export function updatePoolMinuteData(poolId: string, event: ethereum.Event): PoolMinuteData {
  const timestamp = event.block.timestamp.toI32()
  const minuteIndex = timestamp / 60 // get unique minute within unix history
  const minuteStartUnix = minuteIndex * 60 // want the rounded effect
  const minutePoolID = poolId.concat('-').concat(minuteIndex.toString())
  const pool = Pool.load(poolId)!
  let poolMinuteData = PoolMinuteData.load(minutePoolID)
  if (poolMinuteData === null) {
    poolMinuteData = new PoolMinuteData(minutePoolID)
    poolMinuteData.periodStartUnix = minuteStartUnix
    poolMinuteData.pool = pool.id
    poolMinuteData.volumeToken0 = ZERO_BD
    poolMinuteData.volumeToken1 = ZERO_BD
    poolMinuteData.volumeUSD = ZERO_BD
    poolMinuteData.txCount = ZERO_BI
    poolMinuteData.feesUSD = ZERO_BD
    poolMinuteData.open = pool.token0Price
    poolMinuteData.high = pool.token0Price
    poolMinuteData.low = pool.token0Price
    poolMinuteData.close = pool.token0Price
  }

  if (pool.token0Price.gt(poolMinuteData.high)) {
    poolMinuteData.high = pool.token0Price
  }

  if (pool.token0Price.lt(poolMinuteData.low)) {
    poolMinuteData.low = pool.token0Price
  }

  poolMinuteData.liquidity = pool.liquidity
  poolMinuteData.sqrtPrice = pool.sqrtPrice
  poolMinuteData.token0Price = pool.token0Price
  poolMinuteData.token1Price = pool.token1Price
  poolMinuteData.close = pool.token0Price
  poolMinuteData.tick = pool.tick
  poolMinuteData.tvlUSD = pool.totalValueLockedUSD
  poolMinuteData.txCount = poolMinuteData.txCount.plus(ONE_BI)
  poolMinuteData.save()

  return poolMinuteData as PoolMinuteData
}

export function updateTokenDayData(token: Token, event: ethereum.Event): TokenDayData {
  const bundle = Bundle.load('1')!
  const timestamp = event.block.timestamp.toI32()
  const dayID = timestamp / 86400
  const dayStartTimestamp = dayID * 86400
  const tokenDayID = token.id
    .toString()
    .concat('-')
    .concat(dayID.toString())
  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD)

  let tokenDayData = TokenDayData.load(tokenDayID)
  if (tokenDayData === null) {
    tokenDayData = new TokenDayData(tokenDayID)
    tokenDayData.date = dayStartTimestamp
    tokenDayData.token = token.id
    tokenDayData.volume = ZERO_BD
    tokenDayData.volumeUSD = ZERO_BD
    tokenDayData.untrackedVolumeUSD = ZERO_BD
    tokenDayData.feesUSD = ZERO_BD
    tokenDayData.open = tokenPrice
    tokenDayData.high = tokenPrice
    tokenDayData.low = tokenPrice
    tokenDayData.close = tokenPrice
  }

  if (tokenPrice.gt(tokenDayData.high)) {
    tokenDayData.high = tokenPrice
  }

  if (tokenPrice.lt(tokenDayData.low)) {
    tokenDayData.low = tokenPrice
  }

  tokenDayData.close = tokenPrice
  tokenDayData.priceUSD = token.derivedETH.times(bundle.ethPriceUSD)
  tokenDayData.totalValueLocked = token.totalValueLocked
  tokenDayData.totalValueLockedUSD = token.totalValueLockedUSD
  tokenDayData.save()

  return tokenDayData as TokenDayData
}

export function updateTokenHourData(token: Token, event: ethereum.Event): TokenHourData {
  const bundle = Bundle.load('1')!
  const timestamp = event.block.timestamp.toI32()
  const hourIndex = timestamp / 3600 // get unique hour within unix history
  const hourStartUnix = hourIndex * 3600 // want the rounded effect
  const tokenHourID = token.id
    .toString()
    .concat('-')
    .concat(hourIndex.toString())
  let tokenHourData = TokenHourData.load(tokenHourID)
  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD)

  if (tokenHourData === null) {
    tokenHourData = new TokenHourData(tokenHourID)
    tokenHourData.periodStartUnix = hourStartUnix
    tokenHourData.token = token.id
    tokenHourData.volume = ZERO_BD
    tokenHourData.volumeUSD = ZERO_BD
    tokenHourData.untrackedVolumeUSD = ZERO_BD
    tokenHourData.feesUSD = ZERO_BD
    tokenHourData.open = tokenPrice
    tokenHourData.high = tokenPrice
    tokenHourData.low = tokenPrice
    tokenHourData.close = tokenPrice
  }

  if (tokenPrice.gt(tokenHourData.high)) {
    tokenHourData.high = tokenPrice
  }

  if (tokenPrice.lt(tokenHourData.low)) {
    tokenHourData.low = tokenPrice
  }

  tokenHourData.close = tokenPrice
  tokenHourData.priceUSD = tokenPrice
  tokenHourData.totalValueLocked = token.totalValueLocked
  tokenHourData.totalValueLockedUSD = token.totalValueLockedUSD
  tokenHourData.save()

  return tokenHourData as TokenHourData
}

export function updateTokenMinuteData(token: Token, event: ethereum.Event): TokenMinuteData {
  const bundle = Bundle.load('1')!
  const timestamp = event.block.timestamp.toI32()
  const minuteIndex = timestamp / 60 // get unique minute within unix history
  const minuteStartUnix = minuteIndex * 60 // want the rounded effect
  const tokenMinuteID = token.id
    .toString()
    .concat('-')
    .concat(minuteIndex.toString())
  let tokenMinuteData = TokenMinuteData.load(tokenMinuteID)
  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD)

  if (tokenMinuteData === null) {
    tokenMinuteData = new TokenMinuteData(tokenMinuteID)
    tokenMinuteData.periodStartUnix = minuteStartUnix
    tokenMinuteData.token = token.id
    tokenMinuteData.volume = ZERO_BD
    tokenMinuteData.volumeUSD = ZERO_BD
    tokenMinuteData.untrackedVolumeUSD = ZERO_BD
    tokenMinuteData.feesUSD = ZERO_BD
    tokenMinuteData.open = tokenPrice
    tokenMinuteData.high = tokenPrice
    tokenMinuteData.low = tokenPrice
    tokenMinuteData.close = tokenPrice
  }

  if (tokenPrice.gt(tokenMinuteData.high)) {
    tokenMinuteData.high = tokenPrice
  }

  if (tokenPrice.lt(tokenMinuteData.low)) {
    tokenMinuteData.low = tokenPrice
  }

  tokenMinuteData.close = tokenPrice
  tokenMinuteData.priceUSD = tokenPrice
  tokenMinuteData.totalValueLocked = token.totalValueLocked
  tokenMinuteData.totalValueLockedUSD = token.totalValueLockedUSD
  tokenMinuteData.save()

  return tokenMinuteData as TokenMinuteData
}

export function updateStatsDayData(stats: Stats | null, event: ethereum.Event): StatsDayData {
  const timestamp = event.block.timestamp.toI32()
  const dayID = timestamp / 86400
  const dayStartTimestamp = dayID * 86400
  const statsDayID = 'stats' + dayID.toString()
  let statsDayData = StatsDayData.load(statsDayID)
  if (statsDayData === null) {
    statsDayData = new StatsDayData(statsDayID)
    statsDayData.date = dayStartTimestamp
    statsDayData.stats = stats ? stats.id : 'stats'
    statsDayData.totalHookCount = ZERO_BI
    statsDayData.totalHookFeesUSD = ZERO_BD
    statsDayData.totalHookVolumeUSD = ZERO_BD
    statsDayData.totalHookUniqueUserCount = ZERO_BI
    statsDayData.totalHookTradingVolumeUSD = ZERO_BD
    statsDayData.totalHookUntrackedTradingVolumeUSD = ZERO_BD
    statsDayData.totalHookValueLockedETH = ZERO_BD
    statsDayData.totalHookValueLockedUSD = ZERO_BD
  }
  if (stats === null) {
    return statsDayData
  }
  statsDayData.totalHookCount = stats.totalHookCount
  statsDayData.totalHookFeesUSD = stats.totalHookFeesUSD
  statsDayData.totalHookVolumeUSD = stats.totalHookVolumeUSD
  statsDayData.totalHookUniqueUserCount = stats.totalHookUniqueUserCount
  statsDayData.totalHookTradingVolumeUSD = stats.totalHookTradingVolumeUSD
  statsDayData.totalHookUntrackedTradingVolumeUSD = stats.totalHookUntrackedTradingVolumeUSD
  statsDayData.totalHookValueLockedETH = stats.totalHookValueLockedETH
  statsDayData.totalHookValueLockedUSD = stats.totalHookValueLockedUSD
  statsDayData.save()

  return statsDayData as StatsDayData
}

export function updateHookDayData(hook: Hook, event: ethereum.Event): HookDayData {
  const timestamp = event.block.timestamp.toI32()
  const dayID = timestamp / 86400
  const dayStartTimestamp = dayID * 86400
  const hookDayID = hook.id + '-' + dayID.toString()
  let hookDayData = HookDayData.load(hookDayID)
  if (hookDayData === null) {
    hookDayData = new HookDayData(hookDayID)
    hookDayData.date = dayStartTimestamp
    hookDayData.hook = hook.id
    hookDayData.poolCount = ZERO_BI
    hookDayData.volumeUSD = ZERO_BD
    hookDayData.feesUSD = ZERO_BD
    hookDayData.totalValueLockedETH = ZERO_BD
    hookDayData.totalValueLockedUSD = ZERO_BD
    hookDayData.tradingVolumeUSD = ZERO_BD
    hookDayData.untrackedTradingVolumeUSD = ZERO_BD
    hookDayData.uniqueUserCount = ZERO_BI
    hookDayData.uniqueLiquidityProviderCount = ZERO_BI
    hookDayData.totalValueLockedETHUntracked = ZERO_BD
    hookDayData.totalValueLockedUSDUntracked = ZERO_BD
  }

  hookDayData.poolCount = hook.poolCount
  hookDayData.volumeUSD = hook.volumeUSD
  hookDayData.feesUSD = hook.feesUSD
  hookDayData.totalValueLockedETH = hook.totalValueLockedETH
  hookDayData.totalValueLockedUSD = hook.totalValueLockedUSD
  hookDayData.tradingVolumeUSD = hook.tradingVolumeUSD
  hookDayData.untrackedTradingVolumeUSD = hook.untrackedTradingVolumeUSD
  hookDayData.totalValueLockedETHUntracked = hook.totalValueLockedETHUntracked
  hookDayData.totalValueLockedUSDUntracked = hook.totalValueLockedUSDUntracked
  hookDayData.uniqueUserCount = hook.uniqueUserCount
  hookDayData.uniqueLiquidityProviderCount = hook.uniqueLiquidityProviderCount

  hookDayData.save()
  return hookDayData as HookDayData
}
