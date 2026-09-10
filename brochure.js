(() => {
  // ============================================================
  // CYBERCITY OPUS — ENQUIRY FORM VALIDATION & HANDLING
  // ============================================================

  const form = document.querySelector('#section-07 form');
  const submitButton = document.getElementById('submit-btn');

  if (!form || !submitButton) return;

  const nameInput = document.getElementById('full-name-input') || form.querySelector('input[type="text"]');
  const phoneInput = document.getElementById('phone-input') || form.querySelector('input[type="tel"]');
  const emailInput = document.getElementById('email-input') || form.querySelector('input[type="email"]');

  const nameError = document.getElementById('name-error-msg');
  const phoneError = document.getElementById('phone-error-msg');
  const emailError = document.getElementById('email-error-msg');

  // ------------------------------------------------------------
  // REAL-TIME PHONE INPUT SANITIZATION (DIGITS ONLY, MAX 10)
  // ------------------------------------------------------------
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      // Strip all non-numeric characters
      let digitsOnly = e.target.value.replace(/\D/g, '');
      
      // Limit strictly to 10 digits
      if (digitsOnly.length > 10) {
        digitsOnly = digitsOnly.substring(0, 10);
      }
      
      e.target.value = digitsOnly;

      // Hide error on typing if valid length reached
      if (digitsOnly.length === 10 && phoneError) {
        phoneError.classList.add('hidden');
        phoneInput.parentElement.classList.remove('border-red-500');
      }
    });
  }

  // Hide email error on typing if valid format
  if (emailInput) {
    emailInput.addEventListener('input', (e) => {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (emailRegex.test(e.target.value.trim()) && emailError) {
        emailError.classList.add('hidden');
        emailInput.parentElement.classList.remove('border-red-500');
      }
    });
  }

  // Hide name error on typing
  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      if (e.target.value.trim().length >= 2 && nameError) {
        nameError.classList.add('hidden');
        nameInput.parentElement.classList.remove('border-red-500');
      }
    });
  }

  // ------------------------------------------------------------
  // FORM SUBMISSION & STRICT VALIDATION
  // ------------------------------------------------------------
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    let isValid = true;
    let firstInvalidInput = null;

    // 1. Validate Name
    const nameValue = nameInput ? nameInput.value.trim() : '';
    if (!nameValue || nameValue.length < 2) {
      isValid = false;
      if (nameError) nameError.classList.remove('hidden');
      if (nameInput) {
        nameInput.parentElement.classList.add('border-red-500');
        if (!firstInvalidInput) firstInvalidInput = nameInput;
      }
    } else {
      if (nameError) nameError.classList.add('hidden');
      if (nameInput) nameInput.parentElement.classList.remove('border-red-500');
    }

    // 2. Validate Phone (MUST BE EXACTLY 10 DIGITS)
    const phoneValue = phoneInput ? phoneInput.value.trim() : '';
    const phoneRegex = /^[0-9]{10}$/;

    if (!phoneRegex.test(phoneValue)) {
      isValid = false;
      if (phoneError) {
        phoneError.textContent = phoneValue.length > 0 
          ? `Phone number must be exactly 10 digits (${phoneValue.length}/10 entered).` 
          : 'Please enter a 10-digit mobile number.';
        phoneError.classList.remove('hidden');
      }
      if (phoneInput) {
        phoneInput.parentElement.classList.add('border-red-500');
        if (!firstInvalidInput) firstInvalidInput = phoneInput;
      }
    } else {
      if (phoneError) phoneError.classList.add('hidden');
      if (phoneInput) phoneInput.parentElement.classList.remove('border-red-500');
    }

    // 3. Validate Email (MUST BE VALID EMAIL FORMAT)
    const emailValue = emailInput ? emailInput.value.trim() : '';
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(emailValue)) {
      isValid = false;
      if (emailError) emailError.classList.remove('hidden');
      if (emailInput) {
        emailInput.parentElement.classList.add('border-red-500');
        if (!firstInvalidInput) firstInvalidInput = emailInput;
      }
    } else {
      if (emailError) emailError.classList.add('hidden');
      if (emailInput) emailInput.parentElement.classList.remove('border-red-500');
    }

    // Stop submission if validation failed
    if (!isValid) {
      if (firstInvalidInput) {
        firstInvalidInput.focus();
      }
      return;
    }

    // Disable button to prevent double submit
    submitButton.disabled = true;
    submitButton.classList.add('opacity-70', 'cursor-not-allowed');
    submitButton.textContent = 'Submitting...';

    // Proceed to Thank You confirmation page
    window.location.href = 'thank-you.html';
  });

})();