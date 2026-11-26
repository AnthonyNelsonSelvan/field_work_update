const getId = (value) => String(value?._id || value || "");

export function getAssignmentLabel(item) {
  const mode = item.assignmentMode || "specific";
  if (mode === "any") return "Any worker";
  if (mode === "all") return "All workers";
  return item.assignedTo?.name || "Unassigned";
}

export function filterWorkItems(items, searchTerm, assignmentFilter) {
  const query = searchTerm.trim().toLowerCase();

  return items.filter((item) => {
    const mode = item.assignmentMode || "specific";
    const assignedToId = getId(item.assignedTo);
    const selectedWorkerId = assignmentFilter.startsWith("worker:")
      ? assignmentFilter.slice("worker:".length)
      : "";
    const assignedUserIds = (item.assignedUsers || []).map(getId);

    const matchesAssignment =
      assignmentFilter === "all" ||
      (assignmentFilter === "any" && mode === "any") ||
      (assignmentFilter === "all-workers" && mode === "all") ||
      (selectedWorkerId &&
        (mode === "any" ||
          assignedToId === selectedWorkerId ||
          assignedUserIds.includes(selectedWorkerId)));

    if (!matchesAssignment) return false;
    if (!query) return true;

    const searchableText = [
      item.scope,
      item.location,
      item.contactPerson,
      item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString() : "",
      item.assignedTo?.name,
      mode === "any" ? "any worker" : "",
      mode === "all" ? "all workers" : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(query);
  });
}
