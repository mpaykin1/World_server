'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.join(__dirname, '..');
const CONTRACT_PATH = '.ai/szh-writing-system.json';

function loadSzhContract(root = DEFAULT_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8'));
}

function normalize(value) {
  return String(value || '').trim();
}

function shouldActivateSzh({ request = '', personalAuthoredText = false } = {}, contract = loadSzhContract()) {
  if (personalAuthoredText && contract.activation.defaultForPersonalAuthoredTextsForUser) return true;
  const haystack = normalize(request).toLocaleLowerCase('ru-RU');
  return contract.aliases.some((alias) => haystack.includes(String(alias).toLocaleLowerCase('ru-RU')));
}

function buildSzhContext({
  request = '',
  currentStyleInstruction = '',
  latestUserEdit = '',
  personalAuthoredText = true
} = {}, contract = loadSzhContract()) {
  const active = shouldActivateSzh({ request, personalAuthoredText }, contract);
  if (!active) return { active: false, id: contract.id };

  return {
    active: true,
    id: contract.id,
    canonicalFile: contract.canonicalFile,
    precedence: contract.precedence,
    latestUserEdit: normalize(latestUserEdit) || null,
    currentStyleInstruction: normalize(currentStyleInstruction) || null,
    coreFormula: contract.coreFormula,
    rules: [...contract.rules],
    orthographyPolicy: contract.orthographyPolicy,
    antiPatterns: [...contract.antiPatterns],
    passes: contract.passes.map((pass) => ({ ...pass })),
    selfCheck: [...contract.selfCheck],
    learningPolicy: { ...contract.learningPolicy }
  };
}

function buildSzhPrompt(options = {}, contract = loadSzhContract()) {
  const context = buildSzhContext(options, contract);
  if (!context.active) return '';

  const priority = [
    context.latestUserEdit ? `LATEST USER EDIT (strongest evidence):\n${context.latestUserEdit}` : '',
    context.currentStyleInstruction ? `CURRENT STYLE INSTRUCTION:\n${context.currentStyleInstruction}` : '',
    `SZH CORE FORMULA:\n${context.coreFormula}`,
    'SZH RULES:\n' + context.rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n'),
    `ORTHOGRAPHY POLICY:\n${context.orthographyPolicy.test}`,
    'FINAL SELF-CHECK:\n' + context.selfCheck.map((rule) => `- ${rule}`).join('\n')
  ].filter(Boolean);

  return priority.join('\n\n');
}

module.exports = {
  CONTRACT_PATH,
  loadSzhContract,
  shouldActivateSzh,
  buildSzhContext,
  buildSzhPrompt
};
