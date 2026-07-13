const bcrypt = require('bcryptjs');

async function createAdmin() {
  const password = 'admin123'; // Simple password
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  
  console.log('\n=== ADMIN CREDENTIALS ===');
  console.log('Email: admin@mevapur.com');
  console.log('Password: admin123');
  console.log('Hashed Password:', hash);
  console.log('=========================\n');
  
  console.log('\nMongoDB mein ye JSON insert karein:\n');
  console.log(JSON.stringify({
    fullName: "Admin User",
    email: "admin@mevapur.com",
    password: hash,
    phone: "03001234567",
    role: "admin",
    isVerified: true,
    createdAt: new Date()
  }, null, 2));
}

createAdmin();