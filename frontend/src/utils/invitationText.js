/*
The words for a pending invitation, so every place that shows one (the pop-up banner,
the Family tab card and the Notifications list) says what it is really for:
- a plain family invitation (join the family and get its alerts),
- an invitation that also shares responsibility for chosen profiles, or
- a request to someone already linked to share responsibility.
*/
const listNames = (names) => (names.length <= 1 ? names.join('')
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export function describeInvitation(inv) {
  const names = listNames((inv.profiles || []).map((p) => p.full_name)) || 'family members';
  if (inv.with_responsibility && inv.method === 'member') {
    return {
      title: 'Shared responsibility',
      message: `${inv.invited_by} asks you to share the responsibility for ${names} (${inv.group_name}).`,
    };
  }
  if (inv.with_responsibility) {
    return {
      title: 'Shared responsibility',
      message: `${inv.invited_by} invited you to join ${inv.group_name} and share the responsibility for ${names}.`,
    };
  }
  return {
    title: 'Family invitation',
    message: `${inv.invited_by} invited you to join ${inv.group_name}.`,
  };
}

// Heading for a list of pending invitations and requests.
export function invitationsHeading(list = []) {
  const count = list.length;
  const requests = list.filter((inv) => inv.with_responsibility).length;
  if (requests === count) {
    return count === 1 ? 'Request to share responsibility' : `${count} requests to share responsibility`;
  }
  if (requests === 0) {
    return count === 1 ? 'You have a family invitation' : `You have ${count} family invitations`;
  }
  return `You have ${count} invitations and requests`;
}
