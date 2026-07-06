const fs = require('fs');

const modalCode = fs.readFileSync('modal_snippet.js', 'utf8');

const filesToUpdate = [
  { path: 'Dashboard/Telecel/telecel.js', provider: 'Telecel', formatFn: 'formatTelecelBundleSize' },
  { path: 'Dashboard/AT Bigtime/at_bigtime.js', provider: 'AT Bigtime', formatFn: 'formatATBigtimeBundleSize' },
  { path: 'Dashboard/AT Ishare/at_ishare.js', provider: 'AT Ishare', formatFn: 'formatATIshareBundleSize' }
];

for (const f of filesToUpdate) {
  let content = fs.readFileSync(f.path, 'utf8');
  
  if (!content.includes('function showPaymentModal(')) {
    content = content.replace(/document\.addEventListener\('DOMContentLoaded'/g, modalCode + '\n\ndocument.addEventListener(\'DOMContentLoaded\'');
  }

  const oldLogicRegex = /\/\/ Submit order to backend[\s\S]+?\}\s*\);\s*\}\s*\}\);/m;
  
  const newLogic = `const selectedOption = bundleSelect.options[bundleSelect.selectedIndex];
            const bundleSize = selectedOption ? ${f.formatFn}(selectedOption.value) : '';
            const amount = parseFloat(selectedOption?.getAttribute('data-price')) || 0;
            const portedEl = document.getElementById('portedNetwork');

            showPaymentModal({
                beneficiary: phoneInput.value.trim(),
                package:     new URLSearchParams(window.location.search).get('provider') || '${f.provider}',
                bundle_size: bundleSize,
                amount:      amount,
                isPorted:    portedEl ? portedEl.checked : false,
            });
        });
    }
});`;

  content = content.replace(oldLogicRegex, newLogic);
  fs.writeFileSync(f.path, content);
  console.log('Updated ' + f.path);
}
