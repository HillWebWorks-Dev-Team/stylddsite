-- Repair a booking after Stripe charged the card but confirm/insert failed.
-- Replace subdomain, booking UUID, and PaymentIntent id before running.

select public.styld_tenant_mark_booking_paid(
  'your-subdomain',
  'BOOKING-UUID-HERE'::uuid,
  'deposit_paid',
  'pi_xxxxxxxxxxxxxxxxxxxxxxxx'
);
