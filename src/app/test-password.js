const bcrypt = require('bcryptjs');
const { getUserByEmailOrUsername } = require('./config/database');

async function testDatabasePassword() {
    try {
        console.log('Testing password against database...\n');
        
        // Lấy user từ database
        const user = await getUserByEmailOrUsername('admin');
        
        if (user) {
            console.log('✅ User found:', user.username);
            console.log('📧 Email:', user.email);
            console.log('🔍 Hash preview:', user.password.substring(0, 40) + '...');
            
            // Test password
            const result = await bcrypt.compare('123456', user.password);
            console.log('🔑 Password "123456" test:', result ? '✅ WORKS' : '❌ FAILED');
            
            if (result) {
                console.log('\n🎉 Success! You can now login with:');
                console.log('Username: admin');
                console.log('Password: 123456');
            }
        } else {
            console.log('❌ User not found in database');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    process.exit(0);
}

testDatabasePassword();
