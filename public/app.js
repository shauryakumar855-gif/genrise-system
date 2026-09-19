async function loadOpportunities(){
  const grid=document.getElementById('opportunityGrid'); if(!grid)return;
  try{const r=await fetch('/api/opportunities');const d=await r.json();grid.innerHTML=d.opportunities.map(o=>`<article class="card"><div class="icon">${o.category==='Learning'?'📚':o.category==='Projects'?'💻':o.category==='Competitions'?'🏆':'🎯'}</div><h3>${escapeHtml(o.title)}</h3><p>${escapeHtml(o.description)}</p><div class="meta">${escapeHtml(o.category)} · ${escapeHtml(o.deadline||'')}</div><button onclick="saveOpportunity(${o.id})">Save Opportunity</button></article>`).join('')}catch(e){grid.innerHTML='<p>Could not load opportunities.</p>'}
}
async function saveOpportunity(id){const r=await fetch('/api/opportunities/'+id+'/apply',{method:'POST'});const d=await r.json();if(r.status===401){location.href='login.html?next=home';return}alert(d.message||d.error)}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
loadOpportunities();
