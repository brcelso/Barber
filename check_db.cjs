
const { execSync } = require('child_process');

try {
    const output = execSync('npx wrangler d1 execute barber-db --command "SELECT email, wa_status, wa_bridge_url FROM users WHERE is_admin = 1 OR is_barber = 1" --local').toString();
    console.log(output);
} catch (e) {
    console.error('Error executing D1 command:', e.message);
    console.error('Stdout:', e.stdout?.toString());
    console.error('Stderr:', e.stderr?.toString());
}
