export const markingLanguages = [
  ['af', 'Afrikaans'], ['en', 'English'], ['nr', 'isiNdebele'], ['xh', 'isiXhosa'], ['zu', 'isiZulu'],
  ['nso', 'Sepedi'], ['st', 'Sesotho'], ['tn', 'Setswana'], ['ss', 'siSwati'], ['ve', 'Tshivenda'], ['ts', 'Tsonga / Xitsonga'],
] as const;
export const languageLabel = (code?: string) => code === 'mixed' ? 'Mixed languages' : code === 'und' ? 'Uncertain language' : markingLanguages.find(([value]) => value === code)?.[1] || 'Automatic detection';
export const annotationLabels: Record<string, string> = { uncertain_handwriting: 'Reading uncertain', alternative_answer: 'Possible alternative answer', possible_harsh_marking: 'Check potentially overlooked credit', memo_ambiguity: 'Marking guide needs review', missing_page: 'Missing page or answer' };
