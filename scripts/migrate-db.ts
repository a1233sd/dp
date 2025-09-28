import db from '../src/lib/db';

const main = () => {
  try {
    console.log('Running database migrations...');
    // Importing the database module already executes migrations as a side effect.
    console.log('Database migrations completed successfully.');
  } finally {
    db.close();
  }
};

try {
  main();
} catch (error) {
  console.error('Failed to run database migrations.');
  console.error(error);
  process.exit(1);
}
