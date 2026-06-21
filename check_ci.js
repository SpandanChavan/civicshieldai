const https = require('https');
const options = { headers: { 'User-Agent': 'Node.js' } };

https.get('https://api.github.com/repos/SpandanChavan/civicshieldai/actions/runs?branch=deployment', options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const run = JSON.parse(data).workflow_runs[0];
    console.log(`Status: ${run.status}, Conclusion: ${run.conclusion}`);
    
    https.get(run.jobs_url, options, (res2) => {
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => {
        const jobs = JSON.parse(data2).jobs;
        jobs.forEach(j => {
          if (j.conclusion === 'failure') {
            console.log(`Job Failed: ${j.name}`);
            j.steps.forEach(s => {
              if (s.conclusion === 'failure') {
                console.log(`  Step Failed: ${s.name}`);
              }
            });
          }
        });
      });
    });
  });
});
