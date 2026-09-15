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

async function sendGuestCredentialsEmail({ email, name, password, booking }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();
  await transporter.sendMail({
    from,
    to: email,
    subject: "Your Hotel Elegance guest account",
    text: `Hello ${name || "Guest"}, your guest account was created for booking ${booking._id}. Email: ${email}. Temporary password: ${password}. Please sign in and change it after your stay is arranged.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#3c2a1e">
        <h2>Your Hotel Elegance guest account</h2>
        <p>Hello ${name || "Guest"}, we created an account so you can manage your reservation.</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Temporary password:</strong> ${password}</p>
        <p>Please sign in and change this password from your profile. Your booking reference is <strong>${booking._id}</strong>.</p>
      </div>
    `,
  });
}

async function sendStaffCredentialsEmail({ email, name, password, position, department, shifts, loginUrl }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();
  await transporter.sendMail({
    from,
    to: email,
    subject: "Your Hotel Elegance staff access details",
    text: `Hello ${name}, your staff account is ready. Position: ${position}. Department: ${department}. Shift: ${shifts}. Login: ${loginUrl}. Email: ${email}. Temporary password: ${password}. Change it after your first sign-in.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243447;max-width:620px">
        <h2 style="color:#9a6b19">Welcome to Hotel Elegance</h2>
        <p>Hello ${name}, management has created your staff account.</p>
        <p><strong>Assignment</strong><br>Position: ${position}<br>Department: ${department}<br>Shift: ${shifts}</p>
        <p><strong>Login email:</strong> ${email}<br><strong>Temporary password:</strong> ${password}</p>
        <p><a href="${loginUrl}" style="display:inline-block;padding:12px 18px;background:#9a6b19;color:#fff;text-decoration:none;border-radius:6px">Open staff login</a></p>
        <p>For security, sign in and change your temporary password immediately. Never share these credentials.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendBookingConfirmationEmail, sendGuestCredentialsEmail, sendStaffCredentialsEmail };
