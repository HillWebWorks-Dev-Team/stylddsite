-- Repair a booking after Stripe charged the card but confirm failed.
-- Replace subdomain, booking UUID, and PaymentIntent id before running.

select public.styld_tenant_mark_booking_paid(
  'your-subdomain',
  'BOOKING-UUID-HERE'::uuid,
  'deposit_paid',
  'pi_xxxxxxxxxxxxxxxxxxxxxxxx'
);

-- PostgREST / RPC parameter names (if calling via API):
-- p_subdomain, p_booking_id (uuid), p_payment_status, p_unit_payment_id
