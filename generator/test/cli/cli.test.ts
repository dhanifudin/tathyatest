import { describe, expect, it } from 'vitest';
import { mutationFilterArgs } from '../../src/adapters/playwright/runner.js';
import { cypressRunArgs } from '../../src/adapters/cypress/runner.js';
import { buildProgram, runMode } from '../../src/cli/cli.js';

describe('tt command tree', () => {
  const program = buildProgram();
  const command = (name: string) => program.commands.find((entry) => entry.name() === name)!;
  const flags = (name: string) => command(name).options.map((option) => option.long);

  it('registers every command', () => {
    expect(program.commands.map((entry) => entry.name())).toEqual(['init', 'crawl', 'generate', 'run', 'report', 'all', 'eval']);
    expect(program.options.map((option) => option.long)).toEqual(['--version', '--config']);
  });

  it('exposes the ease-of-use flags', () => {
    expect(flags('generate')).toEqual(['--framework', '--fresh', '--read-only']);
    expect(flags('all')).toEqual(['--framework', '--fresh', '--read-only']);
    expect(flags('run')).toEqual(['--framework', '--read-only', '--write-only']);
    expect(flags('report')).toEqual(['--framework']);
    expect(flags('eval')).toEqual(['--framework', '--stack', '--all-stacks', '--repeat', '--no-faults', '--no-coverage', '--no-baseline']);
    expect(command('run').registeredArguments.map((argument) => argument.name())).toEqual(['frameworkArgs']);
  });

  it('accepts only registered frameworks', () => {
    const generate = command('generate').options.find((option) => option.long === '--framework')!;
    expect(generate.argChoices).toEqual(['playwright', 'cypress']);
  });

  it('turns the mutation filters into each framework\'s tag filter', () => {
    expect(runMode({})).toBeUndefined();
    expect(() => runMode({ readOnly: true, writeOnly: true })).toThrow('exclude each other');
    expect(mutationFilterArgs(undefined)).toEqual([]);
    expect(mutationFilterArgs(runMode({ readOnly: true }))).toEqual(['--grep-invert', '@write']);
    expect(mutationFilterArgs(runMode({ writeOnly: true }))).toEqual(['--grep-invert', '@read']);
    expect(cypressRunArgs({ role: 'admin', browser: 'electron', mode: 'read-only' })).toEqual(['run', '--browser', 'electron', '--expose', 'role=admin,grepTags=-@write']);
    expect(cypressRunArgs({ role: 'user', browser: 'firefox', mode: 'write-only' })).toEqual(['run', '--browser', 'firefox', '--expose', 'role=user,grepTags=-@read']);
    expect(cypressRunArgs({ role: 'user', browser: 'electron' })).toEqual(['run', '--browser', 'electron', '--expose', 'role=user']);
  });
});
