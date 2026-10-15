import { expect, test } from 'claude-code/testing'

import { cleanTargets, failureLines, tail } from '../hooks/git'

const KEEP = ['node_modules', 'packages']

test('the QA clean removes build output but nothing inside a kept folder', () => {
  const listing = [
    'Would remove Timebase.Core/src/Timebase.Core.React.UI/node_modules/',
    'Would remove Timebase.Lab/src/Timebase.Mqtt.Broker.UI/node_modules/',
    'Would remove Timebase.Lab/src/Timebase.Mqtt.Broker/bin/',
    'Would remove Timebase.Lab/src/Timebase.Mqtt.Broker/obj/',
    'Would remove packages/cache.bin',
    'Would remove node_modules/',
    'Would remove dist/index.js',
  ].join('\r\n')

  expect(cleanTargets(listing, KEEP)).toEqual([
    'Timebase.Lab/src/Timebase.Mqtt.Broker/bin/',
    'Timebase.Lab/src/Timebase.Mqtt.Broker/obj/',
    'dist/index.js',
  ])
})

test('a file reached through a kept folder is never a target, whatever ignore rule it matches', () => {
  // What the old `-e !node_modules` clean listed: pnpm's junction to Core, walked into, so Core's
  // tracked package-lock.json would have gone.
  const listing = 'Would remove Timebase.Lab/src/Timebase.Lab.UI/node_modules/@timebase/react-ui/package-lock.json\n'

  expect(cleanTargets(listing, KEEP)).toEqual([])
})

test('kept folder names match whole path parts, in any case, and quoted paths are unquoted', () => {
  const listing = [
    'Would remove Node_Modules/',
    'Would remove my_node_modules_backup/',
    'Would remove "a folder/out/"',
    'Some other line',
  ].join('\n')

  expect(cleanTargets(listing, KEEP)).toEqual(['my_node_modules_backup/', 'a folder/out/'])
})

test('a blocker names the failing tests even when they are far above the last lines', () => {
  const output = [
    'Passed!  - Failed:     0, Passed:    10, Total:    10 - Timebase.Lab.Configuration.Tests.dll',
    'Failed!  - Failed:   157, Passed:   190, Total:   347 - Timebase.OpcUa.Server.Tests.dll',
    ...Array.from({ length: 200 }, (_, i) => `noise line ${i} that the tail cuts off`),
    'Passed!  - Failed:     0, Passed:   283, Total:   283 - Timebase.SparkplugB.Host.Tests.dll',
  ].join('\n')

  const text = tail(output, 200)

  expect(text.startsWith('Failed!  - Failed:   157')).toBe(true)
  expect(text).toContain('Timebase.SparkplugB.Host.Tests.dll')
  expect(text).not.toContain('Timebase.Lab.Configuration.Tests.dll')
})

test('failure lines are de-duplicated and capped', () => {
  const output = [
    '[xUnit.net 00:00:12.12]     Some.Test [FAIL]',
    '[xUnit.net 00:00:12.12]     Some.Test [FAIL]',
    'error CS0117: does not contain a definition',
    ...Array.from({ length: 30 }, (_, i) => `[xUnit.net] Test${i} [FAIL]`),
  ].join('\n')

  const lines = failureLines(output)

  expect(lines.length).toBe(20)
  expect(lines[0]).toBe('[xUnit.net 00:00:12.12]     Some.Test [FAIL]')
  expect(lines[1]).toBe('error CS0117: does not contain a definition')
})

test('a clean run keeps the plain tail', () => {
  expect(tail('Passed!  - Failed:     0, Passed:    10\nDone')).toBe('Passed!  - Failed:     0, Passed:    10\nDone')
})
