// Open questions: questions the grill survey raised that the user could not answer yet.
// They are stored on the map (kartograph.json .openQuestions) stamped with the feature
// (survey) they arose from. The viewer shows them grouped by feature — the complete list
// to walk through in a customer meeting.

// Group open questions by their origin feature (survey slug). Returns groups sorted with
// the most recent feature first; within a group, questions are sorted newest date first.
// Pure — safe to unit-test without a DOM.
export function groupQuestionsByFeature(openQuestions) {
  const byFeature = new Map();
  for (const q of openQuestions ?? []) {
    const slug = q.feature.slug;
    if (!byFeature.has(slug)) {
      byFeature.set(slug, { slug, description: q.feature.description, latestDate: q.date, questions: [] });
    }
    const group = byFeature.get(slug);
    group.questions.push({ question: q.question, date: q.date, context: q.context });
    if (q.date > group.latestDate) group.latestDate = q.date;
  }
  const groups = [...byFeature.values()];
  for (const g of groups) g.questions.sort((a, b) => b.date.localeCompare(a.date));
  groups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  return groups;
}

// Total number of open questions across all features.
export function countQuestions(openQuestions) {
  return (openQuestions ?? []).length;
}
