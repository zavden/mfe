import { describe, expect, it } from 'vitest';
import { audioNamePrompt, audioNameTaken, freeAudioName } from '../audioNames';

const assets = [{ name: 'voice' }, { name: 'voice 2' }, { name: ' intro ' }];

describe('the names of the recordings', () => {
  it('knows a name a recording has, the spaces around it aside', () => {
    expect(audioNameTaken(assets, 'voice')).toBe(true);
    expect(audioNameTaken(assets, '  voice ')).toBe(true);
    expect(audioNameTaken(assets, 'intro')).toBe(true);
    expect(audioNameTaken(assets, 'Voice')).toBe(false);
    expect(audioNameTaken(assets, 'voice 3')).toBe(false);
    expect(audioNameTaken([], 'voice')).toBe(false);
  });

  it('proposes the first numbered name that is free', () => {
    expect(freeAudioName(assets, 'voice')).toBe('voice 3');
    expect(freeAudioName(assets, ' intro ')).toBe('intro 2');
    expect(freeAudioName([{ name: 'a' }], 'a')).toBe('a 2');
  });
});

describe('the dialog of a recording that comes in under a name in use', () => {
  it('names the clash and the file, starts from a free name, and takes only a free one', () => {
    const prompt = audioNamePrompt(assets, 'voice', 'voice.mp3');
    expect(prompt.message).toContain('“voice”');
    expect(prompt.message).toContain('voice.mp3');
    expect(prompt.value).toBe('voice 3');
    expect(prompt.validate(prompt.value)).toBeNull();
    expect(prompt.validate('narration')).toBeNull();
    expect(prompt.validate('')).toBe('A recording needs a name.');
    expect(prompt.validate('voice')).toBe('Another recording has this name.');
    expect(prompt.validate('voice 2')).toBe('Another recording has this name.');
    expect(prompt.validate('intro')).toBe('Another recording has this name.');
  });
});
