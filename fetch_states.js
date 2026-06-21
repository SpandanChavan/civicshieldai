const fs = require('fs');

const states = [
    ['Andhra Pradesh', 'AP', 'Amaravati'],
    ['Arunachal Pradesh', 'AR', 'Itanagar'],
    ['Assam', 'AS', 'Dispur'],
    ['Bihar', 'BR', 'Patna'],
    ['Chhattisgarh', 'CG', 'Raipur'],
    ['Goa', 'GA', 'Panaji'],
    ['Gujarat', 'GJ', 'Gandhinagar'],
    ['Haryana', 'HR', 'Chandigarh'],
    ['Himachal Pradesh', 'HP', 'Shimla'],
    ['Jharkhand', 'JH', 'Ranchi'],
    ['Karnataka', 'KA', 'Bengaluru'],
    ['Kerala', 'KL', 'Thiruvananthapuram'],
    ['Madhya Pradesh', 'MP', 'Bhopal'],
    ['Maharashtra', 'MH', 'Mumbai'],
    ['Manipur', 'MN', 'Imphal'],
    ['Meghalaya', 'ML', 'Shillong'],
    ['Mizoram', 'MZ', 'Aizawl'],
    ['Nagaland', 'NL', 'Kohima'],
    ['Odisha', 'OR', 'Bhubaneswar'],
    ['Punjab', 'PB', 'Chandigarh'],
    ['Rajasthan', 'RJ', 'Jaipur'],
    ['Sikkim', 'SK', 'Gangtok'],
    ['Tamil Nadu', 'TN', 'Chennai'],
    ['Telangana', 'TG', 'Hyderabad'],
    ['Tripura', 'TR', 'Agartala'],
    ['Uttar Pradesh', 'UP', 'Lucknow'],
    ['Uttarakhand', 'UK', 'Dehradun'],
    ['West Bengal', 'WB', 'Kolkata'],
    ['Andaman and Nicobar Islands', 'AN', 'Port Blair'],
    ['Chandigarh', 'CH', 'Chandigarh'],
    ['Dadra and Nagar Haveli and Daman and Diu', 'DN', 'Daman'],
    ['Delhi', 'DL', 'New Delhi'],
    ['Jammu and Kashmir', 'JK', 'Srinagar'],
    ['Ladakh', 'LA', 'Leh'],
    ['Lakshadweep', 'LD', 'Kavaratti'],
    ['Puducherry', 'PY', 'Puducherry']
];

async function run() {
    const results = [];
    for (const [name, code, capital] of states) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?state=${encodeURIComponent(name)}&country=India&format=json`;
            const res = await fetch(url, { headers: { 'User-Agent': 'CivicShield/1.0' } });
            const data = await res.json();
            if (data && data.length > 0) {
                const bbox = data[0].boundingbox; // [south, north, west, east]
                results.push(`  ('${name}', '${code}', '${capital}', ${bbox[1]}, ${bbox[0]}, ${bbox[3]}, ${bbox[2]})`);
            } else {
                results.push(`  ('${name}', '${code}', '${capital}', 0, 0, 0, 0)`);
            }
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error(`Error for ${name}:`, e.message);
            results.push(`  ('${name}', '${code}', '${capital}', 0, 0, 0, 0)`);
        }
    }
    
    const sql = `CREATE TABLE IF NOT EXISTS states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code CHAR(2) NOT NULL UNIQUE,
  capital VARCHAR(100),
  bbox_north DECIMAL, bbox_south DECIMAL,
  bbox_east DECIMAL, bbox_west DECIMAL
);

INSERT INTO public.states (name, code, capital, bbox_north, bbox_south, bbox_east, bbox_west) VALUES
${results.join(',\n')}
ON CONFLICT (code) DO NOTHING;
`;

    fs.writeFileSync('C:/Users/Spandan/OneDrive/Desktop/Codes/civicshield-ai/states_insert.sql', sql);
    console.log('Done!');
}

run();
