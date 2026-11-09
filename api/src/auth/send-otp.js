/**
 * Placeholder for the OTP service (US-02).
 *
 * Registration calls sendOtp(user) after the account is committed.
 * US-02 replaces this with the real service that generates the code, stores
 * its hash and expiry on the user, and emails it.
 *
 * @param {{ id: number, email: string }} _user
 */
// TODO(US-02): replace with the real OTP service.
async function sendOtp(_user) {}

module.exports = { sendOtp };
