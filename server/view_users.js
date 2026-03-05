const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const users = await prisma.user.findMany();
        console.log('--- Registered Users ---');
        if (users.length === 0) {
            console.log('No users found.');
        } else {
            users.forEach(user => {
                console.log(`ID: ${user.id}, Username: ${user.username}, Created: ${user.createdAt}`);
            });
        }
        console.log('------------------------');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
