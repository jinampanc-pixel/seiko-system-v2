# User login readiness

A user should be fully prepared before their first ERP sign-in.

The administrator workflow is:

1. Create the user and assign business, role, modules, and granular permissions.
2. Add email and optional phone.
3. Set or generate an initial password before saving a new user.
4. Copy/share that one-time password with the user. It is never recoverable from the ERP after save.
5. The user can sign in immediately after the account is saved.
6. On first password sign-in, the user must replace the initial password with a private password.
7. For an existing user, entering a new value in Reset password revokes existing sessions and forces a new private password on next sign-in.

The Users & Access interface must describe this state as **Ready to sign in**, **Ready · temporary password**, or **Set an initial password** rather than implementation-centric wording such as “ERP login not configured.”
