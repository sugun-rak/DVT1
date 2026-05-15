require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('--- DVT SMTP Diagnostic Tool ---');
console.log('User:', process.env.SMTP_USER || 'sugun.rakshit@gmail.com');
console.log('Pass:', process.env.SMTP_PASS ? '********' : '(MISSING!)');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER || 'sugun.rakshit@gmail.com',
        pass: process.env.SMTP_PASS || ''
    }
});

async function runTest() {
    console.log('\n1. Verifying connection...');
    try {
        await transporter.verify();
        console.log('✅ Connection verified successfully!');
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        if (err.code === 'EAUTH') {
            console.log('\n💡 TIP: Check if you need an App Password (2-Step Verification is usually required).');
        }
        return;
    }

    console.log('\n2. Sending test email...');
    try {
        const info = await transporter.sendMail({
            from: `"DVT Test" <${process.env.SMTP_USER || 'sugun.rakshit@gmail.com'}>`,
            to: process.env.SMTP_USER || 'sugun.rakshit@gmail.com',
            subject: 'DVT1 SMTP Diagnostic Test',
            text: 'This is a test email from the DVT1 diagnostic tool. If you received this, your SMTP settings are correct!',
            html: '<h3>DVT1 SMTP Diagnostic</h3><p>This is a test email. <b>Your SMTP settings are working!</b></p>'
        });
        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
    } catch (err) {
        console.error('❌ Failed to send email:', err.message);
    }
}

runTest();
