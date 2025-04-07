# Query Examples

## Query all hooks

```
{
  hooks {
    id
  }
}
```

# Hook User (User)

• Definition: The number of unique wallet addresses that have used the Hook mechanism historically

```
{
  hook(id: "0x0000fe59823933ac763611a69c88f91d45f81888") {
    pools {
      uniqueUserCount
    }
  }
}
```

Adding values ​​in the array

# Hook Fee (Fee)

• Definition: The current Hook mechanism transaction fee ratio.

```
{
  hook(id: "0x0000fe59823933ac763611a69c88f91d45f81888") {
    feesUSD
  }
}
```

# Hook Pools Details

```
{
  hook(id: "0x0000fe59823933ac763611a69c88f91d45f81888") {
    pools {
      id
      token0 {
        name
        id
      }
      token1 {
        name
        id
      }
    }
  }
}
```

# Total Trading Volume of the Pool (Total Trading Vol.)

• Definition: This value should be consistent with uni v3
• Total trading volume of the pool

```
{
  pool(id: "0x00ef227c44fdb9dead9e5249abacfd8236ff375e84f6578e4c64743643a90447") {
    untrackedVolumeUSD
  }
}
```

# pool details

```
{
  pool(id: "0x00ef227c44fdb9dead9e5249abacfd8236ff375e84f6578e4c64743643a90447") {
    untrackedVolumeUSD
    token0 {
      id
      name
    }
    token1 {
      name
      id
      volumeUSD
      txCount
      totalValueLockedUSD
    }
    liquidity
    feesUSD
  }
}
```

# Query all pools based on token0 and token1, and get the corresponding hook, trading volume and total value locked

```
{
  pools(
    where: {token0: "0x000000c396558ffbab5ea628f39658bdf61345b3", token1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"}
  ) {
    id
    hooks {
      id
      tradingVolumeUSD
      totalValueLockedUSD
    }
  }
}
```
