# FM24 formula research

`interest-threshold.js` is a verified JavaScript translation of the interest
filter's manager-CA threshold adjustment. It is not a standalone player-interest
or minimum-bid calculator and is not connected to the production viewer.

Read [the recovery report](../../docs/fm24-formula-recovery.md) for build identity,
instruction evidence, native comparisons and unresolved dependencies.

Run its regression checks with:

```powershell
node --test test/fm-formula-threshold.test.js
```

Captured game bytes, decompiler output, downloaded research tools and the Ghidra
project stay in the ignored `scratchpad/rea-fm24` directory. They are not bundled
in the app or installer.
