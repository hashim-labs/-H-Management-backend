const nodemailer = require("nodemailer");

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error("SMTP email configuration is incomplete");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_PORT) === "465",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
}

async function sendVerificationEmail({ email, name, otp }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to: email,
    subject: "Verify your Hotel Elegance account",
    text: `Hello ${name || "Guest"}, your Hotel Elegance verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#3c2a1e">
        <h2>Verify your Hotel Elegance account</h2>
        <p>Use this one-time verification code to finish creating your account:</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:8px">${otp}</p>
        <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

async function sendBookingConfirmationEmail({ email, name, booking }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();
  const checkIn = new Date(booking.checkin).toLocaleDateString("en-US");
  const checkOut = new Date(booking.checkout).toLocaleDateString("en-US");
  const room = booking.rooms?.[0];

  await transporter.sendMail({
    from,
    to: email,
    subject: "Hotel Elegance booking confirmation",
    text: `Hello ${name || "Guest"}, your booking is confirmed. Stay: ${checkIn} to ${checkOut}. Room: ${room?.roomType || "Deluxe Suites"}. Total: $${booking.totalPrice}.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#3c2a1e">
        <h2>Booking confirmation</h2>
        <p>Hello ${name || "Guest"}, your Hotel Elegance booking has been received.</p>
        <p><strong>Stay:</strong> ${checkIn} to ${checkOut}</p>
        <p><strong>Room:</strong> ${room?.roomType || "Deluxe Suites"}</p>
        <p><strong>Total:</strong> $${booking.totalPrice}</p>
        <p>We look forward to welcoming you.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendBookingConfirmationEmail };
