const pool = require('./database');

const skills = [
  // Programming Languages
  'C',
  'C++',
  'C#',
  'Java',
  'JavaScript',
  'TypeScript',
  'Python',
  'PHP',
  'Ruby',
  'Go',
  'Rust',
  'Swift',
  'Kotlin',
  'Dart',
  'R',
  'MATLAB',
  'Scala',
  'Perl',
  'Bash',
  'PowerShell',

  // Frontend Development
  'HTML',
  'CSS',
  'Sass',
  'Tailwind CSS',
  'Bootstrap',
  'React',
  'Next.js',
  'Angular',
  'Vue.js',
  'Nuxt.js',
  'Svelte',
  'Redux',
  'Webpack',
  'Vite',
  'Responsive Web Design',

  // Backend Development
  'Node.js',
  'Express.js',
  'NestJS',
  'Django',
  'Flask',
  'FastAPI',
  'Spring Boot',
  'ASP.NET Core',
  'Laravel',
  'Symfony',
  'Ruby on Rails',
  'REST APIs',
  'GraphQL',
  'Microservices',
  'WebSockets',

  // Databases
  'SQL',
  'PostgreSQL',
  'MySQL',
  'SQLite',
  'Microsoft SQL Server',
  'MongoDB',
  'Redis',
  'Oracle Database',
  'Firebase',
  'Elasticsearch',
  'Database Design',
  'Database Management',

  // Data Science and AI
  'Machine Learning',
  'Deep Learning',
  'Artificial Intelligence',
  'Natural Language Processing',
  'Computer Vision',
  'Data Analysis',
  'Data Visualization',
  'Data Science',
  'Pandas',
  'NumPy',
  'Scikit-learn',
  'TensorFlow',
  'PyTorch',
  'Keras',
  'OpenCV',
  'Jupyter Notebook',
  'Power BI',
  'Tableau',
  'Microsoft Excel',
  'Apache Spark',

  // Cloud and DevOps
  'Git',
  'GitHub',
  'GitLab',
  'Docker',
  'Kubernetes',
  'Jenkins',
  'GitHub Actions',
  'Linux',
  'AWS',
  'Microsoft Azure',
  'Google Cloud Platform',
  'Terraform',
  'CI/CD',
  'Nginx',

  // Software Engineering and Testing
  'Object-Oriented Programming',
  'Data Structures',
  'Algorithms',
  'Software Design Patterns',
  'Clean Code',
  'Unit Testing',
  'Integration Testing',
  'Jest',
  'Mocha',
  'Cypress',
  'Selenium',
  'Postman',
  'API Testing',
  'Agile Methodology',
  'Scrum',

  // Mobile Development
  'Flutter',
  'React Native',
  'Android Development',
  'iOS Development',
  'Android Studio',
  'Xamarin',

  // UI/UX and Design
  'UI Design',
  'UX Design',
  'Figma',
  'Adobe Photoshop',
  'Adobe Illustrator',
  'Wireframing',
  'Prototyping',

  // Networking and Security
  'Computer Networking',
  'TCP/IP',
  'Cybersecurity',
  'Network Security',
  'Ethical Hacking',
  'Cryptography',

  // Project and Business Management
  'Project Management',
  'Product Management',
  'Business Analysis',
  'Requirements Analysis',
  'Technical Documentation'
];

async function seedSkills() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let insertedCount = 0;

    for (const skill of skills) {
      const result = await client.query(
        `INSERT INTO skills (canonical_name, created_at)
         VALUES ($1, CURRENT_TIMESTAMP)
         ON CONFLICT (canonical_name) DO NOTHING`,
        [skill]
      );

      insertedCount += result.rowCount;
    }

    await client.query('COMMIT');

    console.log(`Skills seeding completed.`);
    console.log(`Total skills in list: ${skills.length}`);
    console.log(`New skills inserted: ${insertedCount}`);
    console.log(`Existing skills skipped: ${skills.length - insertedCount}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError.message);
    }

    throw error;
  } finally {
    client.release();
  }
}

seedSkills()
  .catch((error) => {
    console.error('Skills seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
