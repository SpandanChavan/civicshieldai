const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, 'src', 'services');

fs.readdirSync(servicesDir).forEach(file => {
  if (file.endsWith('.js')) {
    const filePath = path.join(servicesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes("const axios = require('axios');")) {
      content = content.replace("const axios = require('axios');", "const axios = require('../utils/axiosClient');");
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated ' + file);
    }
  }
});
