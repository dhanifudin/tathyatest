import { describe, expect, it } from 'vitest';
import { buildProgram, mutationFilterArgs } from '../src/cli.js';

describe('tt command tree', () => {
  const program = buildProgram();
  const command = (name: string) => program.commands.find((entry) => entry.name() === name)!;
  const flags = (name: string) => command(name).options.map((option) => option.long);

  it('registers every command', () => {
    expect(program.commands.map((entry) => entry.name())).toEqual(['init', 'crawl', 'generate', 'run', 'report', 'all', 'eval']);
    expect(program.options.map((option) => option.long)).toEqual(['--version', '--config']);
  });

  it('exposes the ease-of-use flags', () => {
    expect(flags('generate')).toEqual(['--fresh', '--read-only']);
    expect(flags('all')).toEqual(['--fresh', '--read-only']);
    expect(flags('run')).toEqual(['--read-only', '--write-only']);
    expect(flags('eval')).toEqual(['--stack', '--all-stacks', '--repeat', '--no-faults', '--no-coverage', '--no-baseline']);
    expect(command('run').registeredArguments.map((argument) => argument.name())).toEqual(['playwrightArgs']);
  });

  it('turns the mutation filters into a composable --grep-invert', () => {
    expect(mutationFilterArgs({})).toEqual([]);
    expect(mutationFilterArgs({ readOnly: true })).toEqual(['--grep-invert', '@write']);
    expect(mutationFilterArgs({ writeOnly: true })).toEqual(['--grep-invert', '@read']);
    expect(() => mutationFilterArgs({ readOnly: true, writeOnly: true })).toThrow('exclude each other');
  });
});
