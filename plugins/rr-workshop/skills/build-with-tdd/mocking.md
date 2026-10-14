# When to Mock

Language-agnostic principles; the repo's own mocking library and idioms live in `docs/agents/testing.md`.

Mock at **system boundaries** only — those are the seams worth a test double:

- External APIs (payment, email, etc.)
- Databases (sometimes — prefer a test DB)
- Time/randomness
- File system (sometimes)

Don't mock:

- Internal collaborators
- Anything you control

Mocking your own collaborators couples the test to your current implementation. Rearrange the internals and the mocks break even though behavior didn't change — the hallmark of a bad test.

## Designing for Mockability

At system boundaries, design interfaces that are easy to mock.

**1. Use dependency injection.** Pass external dependencies in as arguments rather than constructing them internally. Production wires in the real thing; the test wires in a fake. The function never reaches out to global state, environment variables, or singletons.

```typescript
// Easy to mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. Prefer SDK-style interfaces over generic fetchers.** Each external operation gets its own function with a specific signature, instead of one generic function with conditional logic inside.

```typescript
// GOOD: each function is independently mockable
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// BAD: mocking requires conditional logic inside the mock
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

The SDK approach means:

- Each mock returns one specific shape — no conditional logic in test setup
- Test setup makes it obvious which operations the code under test exercises
- Type safety per endpoint
- Refactoring one operation doesn't ripple through every mock

**3. Make adapters explicit.** Following ports & adapters: the boundary is a port (interface); production is one adapter, the test is another. One adapter = a hypothetical seam. Two adapters = a real one.
