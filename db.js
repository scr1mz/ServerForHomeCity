const Pool = require('pg').Pool
const pool = new Pool({
    user: "postgres",
    password: '57590095',
    host: "localhost",
    port: 5432,
    database: "HomeCityDB"
})

module.exports = pool