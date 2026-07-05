// Pure helpers shared by the explore command and discovery workflow.
export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')     // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')        // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, '');           // trim leading/trailing hyphens
}

export function surveyFilename(date, slug) {
  return `.kartograph/surveys/${date}-${slug}.discovery.json`;
}
