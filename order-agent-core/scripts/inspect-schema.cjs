const fs = require('fs');

async function checkTypes() {
  const query = `
    query {
      __schema {
        types {
          name
          kind
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
                ofType {
                  name
                  kind
                }
              }
            }
          }
        }
      }
    }
  `;
  const res = await fetch('https://karibu-dev.heidelbergmaterials.com/api/graphql/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const data = await res.json();
  const targetNames = [
    'SalesVoucher', 'SalesVoucherItem', 'SalesVoucherOrder', 'Basket', 'BasketOrder',
    'Customer', 'Product', 'Payment', 'User', 'Company', 'Country', 'Location',
    'Bank', 'BankBranch', 'Destination', 'PaymentMode', 'CustomerTranscriptionItem'
  ];
  const matched = data.data.__schema.types.filter(t => targetNames.includes(t.name));
  
  const result = {};
  for (const t of matched) {
    result[t.name] = t.fields?.map(f => {
      let typeName = f.type.name;
      if (!typeName && f.type.ofType) {
        typeName = f.type.ofType.name || (f.type.ofType.ofType ? f.type.ofType.ofType.name : 'Unknown');
      }
      return `${f.name}: ${typeName}`;
    });
  }
  fs.writeFileSync('schema-fields.json', JSON.stringify(result, null, 2));
  console.log('Saved schema-fields.json successfully. Found types:', Object.keys(result));
}

checkTypes().catch(console.error);
