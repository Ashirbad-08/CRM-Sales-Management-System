/** Overdue is derived: a Pending activity whose dueDate has passed. */
function activityStatusFilter(statuses, now = new Date()) {
  const clauses = [];
  if (statuses.includes('Pending')) clauses.push({ status: 'Pending', $or: [{ dueDate: null }, { dueDate: { $gte: now } }] });
  if (statuses.includes('Overdue')) clauses.push({ status: 'Pending', dueDate: { $lt: now } });
  if (statuses.includes('Completed')) clauses.push({ status: 'Completed' });
  return clauses.length ? { $or: clauses } : null;
}
module.exports = { activityStatusFilter };
