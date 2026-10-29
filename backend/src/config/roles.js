/*
The two LocalAlert roles. Their names match the role_name values in the roles table,
so they are kept in one place instead of being typed out in every file.
*/
const ADMIN = "Family Administrator";
const MEMBER = "Community Member";

module.exports = { ADMIN, MEMBER, ALL_ROLES: [ADMIN, MEMBER] };
