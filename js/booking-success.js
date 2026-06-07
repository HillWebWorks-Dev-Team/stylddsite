(function () {
  var params = new URLSearchParams(window.location.search);
  var bookingId = params.get('booking_id') || params.get('id') || '';
  var idCard = document.getElementById('success-id-card');
  var generic = document.getElementById('success-generic');
  var idEl = document.getElementById('success-booking-id');

  if (bookingId && idEl && idCard) {
    idEl.textContent = bookingId;
    idCard.hidden = false;
    if (generic) generic.hidden = true;
  } else if (generic) {
    generic.hidden = false;
    if (idCard) idCard.hidden = true;
  }
})();
