document.addEventListener('DOMContentLoaded', () => {
  fetchUsers();
  setupTableListeners();

  const form = document.getElementById('addUserForm');
  const heading = document.querySelector('.card h3');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subdomain = document.getElementById('subdomain').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const isActive = document.getElementById('isActive').checked;

    // Visual feedback
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/users', {
        method: 'POST', // API handles both create and update (upsert)
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, phoneNumber, isActive })
      });

      if (res.ok) {
        resetForm(); // Reset to "Add New User" mode
        fetchUsers();
      } else {
        const text = await res.text();
        alert('Failed to save user: ' + text);
      }
    } catch (error) {
      console.error('Error saving user:', error);
      alert('Error saving user.');
    } finally {
      submitBtn.textContent = originalBtnText;
      submitBtn.disabled = false;
    }
  });

  // Reset button handler
  const resetBtn = form.querySelector('.reset-btn');
  if (resetBtn) {
    resetBtn.onclick = () => resetForm();
  }
});

function resetForm() {
  const form = document.getElementById('addUserForm');
  form.reset();

  // Restore UI for "Add New User" mode
  document.getElementById('subdomain').readOnly = false;
  document.getElementById('subdomain').style.backgroundColor = '';
  document.querySelector('.card h3').textContent = 'Add New User';
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.textContent = 'Save User';
}

function startEditUser(user) {
  document.getElementById('subdomain').value = user.subdomain;
  document.getElementById('phoneNumber').value = user.phoneNumber;
  document.getElementById('isActive').checked = user.isActive;

  // UI for "Edit User" mode
  document.getElementById('subdomain').readOnly = true;
  document.getElementById('subdomain').style.backgroundColor = '#e9ecef'; // Visual cue for readonly
  document.querySelector('.card h3').textContent = 'Edit User: ' + user.subdomain;
  document.querySelector('button[type="submit"]').textContent = 'Update User';

  // Scroll to form
  document.getElementById('addUserForm').scrollIntoView({ behavior: 'smooth' });
}

async function fetchUsers() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Failed to fetch users');
    const users = await res.json();
    renderUsers(users);
  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('userTableBody');
  tbody.innerHTML = '';

  users.sort((a, b) => a.subdomain.localeCompare(b.subdomain));

  users.forEach(user => {
    const tr = document.createElement('tr');
    // Store user data in dataset for easy access
    tr.dataset.user = JSON.stringify(user);

    tr.innerHTML = `
            <td>${user.subdomain}</td>
            <td>${user.phoneNumber}</td>
            <td class="${user.isActive ? 'status-active' : 'status-inactive'}">
                ${user.isActive ? 'Active' : 'Inactive'}
            </td>
            <td>
                <button type="button" class="edit-btn">Edit</button>
                <button type="button" class="delete-btn">🗑️</button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

function setupTableListeners() {
  const tbody = document.getElementById('userTableBody');

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const tr = btn.closest('tr');
    if (!tr) return;

    const user = JSON.parse(tr.dataset.user);

    if (btn.classList.contains('edit-btn')) {
      startEditUser(user);
    } else if (btn.classList.contains('delete-btn')) {
      await handleDeleteUser(user.subdomain);
    }
  });
}

async function handleDeleteUser(subdomain) {
  if (!confirm('Are you sure you want to delete user: ' + subdomain + '?')) return;

  try {
    const res = await fetch(`/api/users/${subdomain}`, { method: 'DELETE' });
    if (res.ok) {
      fetchUsers();
      // If we deleted the user currently being edited, reset the form
      const currentEditing = document.getElementById('subdomain').value;
      if (document.getElementById('subdomain').readOnly && currentEditing === subdomain) {
        resetForm();
      }
    } else {
      alert('Failed to delete user');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    alert('Error deleting user.');
  }
}
