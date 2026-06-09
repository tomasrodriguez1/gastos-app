import postgres from 'postgres'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

const isProduction = process.env.NODE_ENV === 'production'
const databaseUrl = process.env.DATABASE_URL

const options = {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  types: {
    numeric: {
      to: 1700,
      from: [1700],
      serialize: (x) => '' + x,
      // String desde PG preserva exactitud; convertir con toMonto() en la API
      parse: (x) => x,
    },
  },
}

// Railway: SSL en prod si la URL no declara sslmode
if (isProduction && !databaseUrl.includes('sslmode=')) {
  options.ssl = 'require'
}

const sql = postgres(databaseUrl, options)

export default sql
