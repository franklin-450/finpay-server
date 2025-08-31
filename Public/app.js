===== app.js =====
// Shared JS for the FinPay pages (lightweight, no frameworks)

document.addEventListener('DOMContentLoaded', () => {
  // simple client-side initializers
  attachHandlers();
  loadSampleData();
});

function attachHandlers(){
  // Hook up simple actions
  window.sendPayment = async function(){
    const to = document.getElementById('payTo')?.value;
    const amount = Number(document.getElementById('payAmount')?.value || 0);
    const currency = document.getElementById('payCurrency')?.value || 'USD';
    if(!to || amount <= 0){ alert('Provide recipient and amount'); return }
    // Post to backend (in-memory) - graceful fallback if server not present
    try{
      const res = await fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({to,amount,currency})});
      const j = await res.json();
      if(j.error) return alert('Error: '+j.error);
      alert('Payment queued — ref: ' + j.tx?.id);
      window.location.href = 'transactions.html';
    }catch(e){
      alert('No backend available — running in static demo mode');
    }
  }

  window.exportCSV = function(){
    const rows = [['Date','Reference','Type','Amount','Status']];
    // collect rows from table
    document.querySelectorAll('#allTxTable tbody tr').forEach(tr=>{
      const cells = Array.from(tr.querySelectorAll('td')).map(t=>t.textContent.trim());
      if(cells.length) rows.push(cells);
    });
    const csv = rows.map(r=>r.map(c=>'"'+c.replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'transactions.csv'; a.click();
  }

  window.submitTicket = async function(){
    const subject = document.getElementById('ticketSubject')?.value;
    const body = document.getElementById('ticketBody')?.value;
    if(!subject || !body) return alert('Fill subject and description');
    try{
      const res = await fetch('/api/support',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subject,body})});
      const j = await res.json();
      alert('Ticket submitted: ' + j.ticket?.id);
      document.getElementById('ticketSubject').value = '';
      document.getElementById('ticketBody').value = '';
    }catch(e){ alert('Ticket saved locally (demo)'); }
  }

  // small helpers for cards and loans
  window.freezeCard = function(which){ alert(which + ' card frozen (demo)'); }
  window.orderReplacement = function(){ alert('Replacement card ordered'); }
  window.applyLoan = function(amount){ alert('Applied for loan: $' + amount); }
}

async function loadSampleData(){
  // try to load txs from backend, else populate demo rows
  try{
    const res = await fetch('/api/txs');
    if(!res.ok) throw new Error('no api');
    const j = await res.json();
    renderTransactions(j.txs || []);
  }catch(e){
    // demo data
    const demo = [
      {date:'2025-08-27',desc:'Salary',amount:2500,ref:'TX-1001'},
      {date:'2025-08-25',desc:'Grocery',amount:-45,ref:'TX-1000'}
    ];
    renderTransactions(demo);
    renderAllTxTable(demo);
    renderInvestments();
  }
}

function renderTransactions(txs){
  const tbody = document.querySelector('#txTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  txs.slice(0,8).forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${t.date}</td><td>${t.desc || t.ref || '—'}</td><td>${t.amount < 0 ? '-' : '+'}$${Math.abs(t.amount)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderAllTxTable(txs){
  const tbody = document.querySelector('#allTxTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  txs.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${t.date}</td><td>${t.ref || ''}</td><td>${t.type || '—'}</td><td>$${t.amount}</td><td>${t.status || 'Success'}</td>`;
    tbody.appendChild(tr);
  });
}

function renderInvestments(){
  // Chart.js placeholder population when library present
  const el = document.getElementById('portfolioChart');
  if(!el) return;
  try{
    const ctx = el.getContext('2d');
    new Chart(ctx,{type:'line',data:{labels:['Jan','Feb','Mar','Apr'],datasets:[{label:'Portfolio',data:[2500,2600,2700,3200],fill:false}]},options:{responsive:true}});
  }catch(e){ /* no chart lib loaded */ }
}

function openQuick(name){ alert('Open quick: ' + name); }

function renderTxs(){
  const query = document.getElementById('txSearch')?.value?.toLowerCase() || '';
  const filter = document.getElementById('txFilter')?.value || 'all';
  // For demo, just re-render static rows
}

// end of app.js
