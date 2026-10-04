# Follow-up order requirements — retained for a later stage

Status: design requirements only. The current stabilization priority is Save & Close. Manual follow-up batches are not implemented by this change.

Provide an order-linked draft batch for alterations, replacements, queries and additions. Start with manual cases; message parsing may propose values later, subject to human review.

- Use stable business, order, batch, case, person, garment and obligation IDs. Preserve source notes and audit corrections; ambiguous person matches require review.
- Keep original balance, replacement, new addition and cancellation/return purposes separate. Track actual returned, outbound and billable quantities independently. Pair/set shortcuts expand to individual garment lines.
- Link returns and pending replacements to the same obligation to prevent double counting. Measurements alone never create garment quantities; blank or unresolved measurements are distinct from zero.
- Preserve original and revised measurements and reasons. Apply holds and quality checks to individual garment lines, allowing other approved lines to proceed.
- Snapshot class rosters and explicitly resolve whether individual requests overlap with, or add to, class instructions.
- Track approval, stock reservation, remaining production, quality checks, packing, dispatch, receipt, cancellation and holds with reconciled quantity events.
- Do not rebill original balances. Review replacement charges and additions explicitly. Reconcile returns against posted invoices/payments through approved credits or refunds; never silently erase financial records.
- Server writes require permission checks, optimistic versions, idempotency and an audit trail.

Sequence for a future stage: manual drafts; return links and billing review; roster expansion, stock and release; quality checks, packing and dispatch exports; reviewed message parsing last.
