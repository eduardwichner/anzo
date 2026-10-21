#!/usr/bin/env node
// Writes models/manifest.json from the downloaded Piper voices in models/piper/:
// name, language, quality, speakers, file sizes + sha256, and the licence/dataset exactly as
// stated in each voice's MODEL_CARD. Called by scripts/fetch-models.sh. Rewrites the file only
// when something changed, and prints "unchanged" otherwise (so a second fetch is a no-op).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const piperDir = path.join(root, 'models', 'piper');
const manifestPath = path.join(root, 'models', 'manifest.json');
const voicesConfig = JSON.parse(fs.readFileSync(path.join(root, 'content', 'voices.json'), 'utf8'));

function fileInfo(file) {
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  return { size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

/** Pull "* Key: value" lines out of the card's "## Dataset" section, verbatim. */
function parseCard(text) {
  if (!text) return { licence: 'NO MODEL_CARD', dataset: null };
  const dataset = text.match(/##\s*Dataset([\s\S]*?)(\n##|$)/i)?.[1] ?? text;
  const pick = (key) => dataset.match(new RegExp(`\\*\\s*${key}:\\s*(.+)`, 'i'))?.[1].trim() ?? null;
  return { licence: pick('License') ?? 'NOT STATED IN MODEL_CARD', dataset: pick('URL') };
}

/** Our reading of the literal licence text. Only "permissive" voices may be a default. */
export function assessLicence(licence) {
  const l = licence.toLowerCase();
  if (l.startsWith('no model_card') || l.startsWith('not stated') || l.includes('see url')) return 'unclear';
  if (/\bnc\b|by-nc|non-?commercial/.test(l)) return 'non-commercial';
  if (/agpl|\bgpl/.test(l)) return 'copyleft';
  if (/by-sa|share-?alike/.test(l)) return 'share-alike';
  if (/public domain|cc0|creativecommons\.org\/licenses\/by\/|cc-by 4\.0|\bcc-by\b|\bmit\b|apache/.test(l)) return 'permissive';
  return 'unclear';
}

// the main voice of each language and its dialogue voice (speaker B of a dialogue)
const wanted = [...new Set(Object.values(voicesConfig).flatMap((v) => [v.voice, v.dialogue?.voice].filter(Boolean)))].sort();
const voices = wanted.map((name) => {
  const onnx = path.join(piperDir, `${name}.onnx`);
  const config = JSON.parse(fs.readFileSync(`${onnx}.json`, 'utf8'));
  const cardFile = path.join(piperDir, `${name}.MODEL_CARD`);
  const card = parseCard(fs.existsSync(cardFile) ? fs.readFileSync(cardFile, 'utf8') : null);
  const defaultFor = Object.entries(voicesConfig).filter(([, v]) => v.voice === name).map(([track]) => track);
  const dialogueFor = Object.entries(voicesConfig).filter(([, v]) => v.dialogue?.voice === name)
    .map(([track, v]) => ({ track, speaker: v.dialogue.speaker ?? null, speakerName: v.dialogue.speakerName ?? null }));
  return {
    name,
    language: config.language?.code ?? config.espeak?.voice ?? null,
    quality: config.audio?.quality ?? name.split('-').pop(),
    sampleRate: config.audio?.sample_rate ?? null,
    speakers: config.num_speakers ?? 1,
    ...(config.num_speakers > 1 ? { speakerIdMap: config.speaker_id_map } : {}),
    licence: card.licence,
    licenceAssessment: assessLicence(card.licence),
    dataset: card.dataset,
    defaultFor,
    ...(dialogueFor.length ? { dialogueFor } : {}),
    files: {
      onnx: fileInfo(onnx),
      config: fileInfo(`${onnx}.json`),
      modelCard: fileInfo(cardFile),
    },
  };
});

// Vosk recognizers (npm run audio:check): licence as stated on the model list, the zip's sha256 recorded at download.
const voskConfig = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'vosk-models.json'), 'utf8'));
const dirBytes = (dir) => (fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true }).reduce((n, f) => { const st = fs.statSync(path.join(dir, f)); return n + (st.isFile() ? st.size : 0); }, 0)
  : null);
const recognizers = Object.entries(voskConfig.models).map(([track, m]) => {
  const shaFile = path.join(root, 'models', 'vosk', `${m.name}.zip.sha256`);
  return {
    name: m.name, track, url: m.url, licence: m.licence, licenceAssessment: assessLicence(m.licence), wer: m.wer,
    bytes: dirBytes(path.join(root, 'models', 'vosk', m.name)),
    zipSha256: fs.existsSync(shaFile) ? fs.readFileSync(shaFile, 'utf8').trim() : null,
  };
});

const out = `${JSON.stringify({ piperVoicesIndex: 'https://huggingface.co/rhasspy/piper-voices', voices, voskModelsIndex: 'https://alphacephei.com/vosk/models', recognizers }, null, 2)}\n`;
// A main voice must be permissive; a dialogue voice may also be share-alike (clear, commercial use allowed), never
// non-commercial or unclear.
const problems = voices.filter((v) => (v.defaultFor.length && v.licenceAssessment !== 'permissive')
  || (v.dialogueFor && !['permissive', 'share-alike'].includes(v.licenceAssessment)));
for (const v of problems) {
  console.error(`WARNING: ${v.defaultFor.length ? "default" : "dialogue"} voice ${v.name} has licence "${v.licence}" (${v.licenceAssessment}); choose a ${v.defaultFor.length ? "permissive" : "permissive or share-alike"} voice`);
}
if (fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, 'utf8') === out) {
  console.log('models/manifest.json unchanged');
} else {
  fs.writeFileSync(manifestPath, out);
  console.log(`models/manifest.json written (${voices.length} voices)`);
}
