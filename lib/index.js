// Public API. The CLI is a thin wrapper around these functions.

export { tokenize, T } from './tokenize.js';
export { findCandidates, applyMutation, sample, rng } from './mutate.js';
export { parseAddedLines, diffAgainst, defaultBase } from './gitdiff.js';
export { buildGraph, testsFor, isTestPath, extractImports } from './graph.js';
export { runOnce, buildCommand, looksLikeSyntaxError } from './runner.js';
export { score, renderText, renderJson, VERSION } from './report.js';
export { run, detectTestCommand, BaselineError } from './engine.js';
export { loadConfig, writeConfig, DEFAULTS, CONFIG_NAME } from './config.js';
