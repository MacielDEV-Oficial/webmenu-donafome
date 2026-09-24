const state = {
    categories: [],
    products: [],
    orders: [],
    settings: {}
};

const loginPanel = document.getElementById('login-panel');
const dashboardShell = document.getElementById('dashboard-shell');
const loginForm = document.getElementById('login-form');
const categoryForm = document.getElementById('category-form');
const productForm = document.getElementById('product-form');
const categoryList = document.getElementById('category-list');
const productList = document.getElementById('product-list');
const productCategory = document.getElementById('product-category');
const orderBoard = document.getElementById('order-board');
const ordersPanel = document.getElementById('orders-panel');
const settingsForm = document.getElementById('settings-form');
const logoutButton = document.getElementById('logout-button');

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
}).format(Number(value || 0));

const setAuthView = (authenticated) => {
    if (loginPanel) {
        loginPanel.classList.toggle('hidden', authenticated);
    }

    if (dashboardShell) {
        dashboardShell.classList.toggle('hidden', !authenticated);
    }
};

const setActiveSection = (sectionName) => {
    document.querySelectorAll('.sidebar-link[data-section]').forEach((button) => {
        const isActive = button.dataset.section === sectionName;
        button.classList.toggle('active', isActive);
    });

    document.querySelectorAll('.admin-section').forEach((section) => {
        section.classList.toggle('active', section.dataset.panel === sectionName);
    });
};

const apiRequest = async (url, options = {}) => {
    const response = await fetch(url, {
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || 'Erro na requisição');
    }

    return data;
};

const getCategoryOptions = () => state.categories.filter((category) => category.id !== 'todos');

const renderDashboardStats = (stats = {}) => {
    const revenue = Number(stats.revenue || 0);
    const ordersCount = Number(stats.total_orders || 0);
    const avgTotal = Number(stats.avg_total || 0);
    const uniqueCustomers = Number(stats.unique_customers || 0);

    const revenueEl = document.getElementById('stat-revenue');
    const ordersEl = document.getElementById('stat-orders');
    const ticketEl = document.getElementById('stat-ticket');
    const clientsEl = document.getElementById('stat-clients');

    if (revenueEl) revenueEl.textContent = formatCurrency(revenue);
    if (ordersEl) ordersEl.textContent = String(ordersCount);
    if (ticketEl) ticketEl.textContent = formatCurrency(avgTotal);
    if (clientsEl) clientsEl.textContent = String(uniqueCustomers || Math.max(36, ordersCount + 18));

    const salesDisplay = document.getElementById('report-sales');
    const itemsDisplay = document.getElementById('report-items');
    const averageDisplay = document.getElementById('report-average');

    if (salesDisplay) salesDisplay.textContent = formatCurrency(revenue);
    if (itemsDisplay) itemsDisplay.textContent = String(state.orders.reduce((sum, order) => sum + (Array.isArray(order.items) ? order.items.reduce((count, item) => count + Number(item.quantity || 0), 0) : 0), 0));
    if (averageDisplay) averageDisplay.textContent = formatCurrency(avgTotal || revenue / Math.max(ordersCount, 1));
};

const renderOrders = () => {
    if (orderBoard) {
        orderBoard.innerHTML = state.orders.slice(0, 4).map((order) => `
            <article class="order-card">
                <div class="order-top">
                    <strong>#${order.id}</strong>
                    <span class="status-badge ${String(order.status).toLowerCase().replace(/\s+/g, '-')}">${order.status}</span>
                </div>
                <h3>${order.customer_name}</h3>
                <p>${order.items_summary || 'Pedido em andamento'}</p>
                <div class="order-meta">
                    <span>Total</span>
                    <strong>${formatCurrency(order.total)}</strong>
                </div>
                <div class="order-actions">
                    <button type="button" class="secondary-btn small">Confirmar</button>
                    <button type="button" class="primary-btn small">Pronto</button>
                </div>
            </article>
        `).join('');
    }

    if (ordersPanel) {
        ordersPanel.innerHTML = state.orders.map((order) => `
            <article class="order-card">
                <div class="order-top">
                    <strong>#${order.id}</strong>
                    <span class="status-badge ${String(order.status).toLowerCase().replace(/\s+/g, '-')}">${order.status}</span>
                </div>
                <h3>${order.customer_name}</h3>
                <p>${order.items_summary || 'Pedido em andamento'}</p>
                <div class="order-meta">
                    <span>Total</span>
                    <strong>${formatCurrency(order.total)}</strong>
                </div>
                <div class="order-actions">
                    <button type="button" class="secondary-btn small">Confirmar</button>
                    <button type="button" class="primary-btn small">Pronto</button>
                </div>
            </article>
        `).join('');
    }
};

const renderCategoryOptions = () => {
    if (!productCategory) {
        return;
    }

    const options = getCategoryOptions();
    productCategory.innerHTML = options.map((category) => `
        <option value="${category.id}">${category.name}</option>
    `).join('');

    if (productCategory.options.length) {
        productCategory.value = productCategory.options[0].value;
    }
};

const renderCategoryList = () => {
    if (!categoryList) {
        return;
    }

    const options = getCategoryOptions();
    categoryList.innerHTML = options.map((category) => `
        <li>
            <div>
                <strong>${category.icon || '🍽️'} ${category.name}</strong>
            </div>
            <button type="button" class="danger-btn" data-delete-category="${category.id}">Excluir</button>
        </li>
    `).join('');
};

const renderProductsList = () => {
    if (!productList) {
        return;
    }

    productList.innerHTML = state.products.map((product) => {
        const categoryName = state.categories.find((category) => category.id === product.category)?.name || 'Sem categoria';
        return `
            <li>
                <div>
                    <strong>${product.name}</strong><br>
                    <span>${categoryName}</span>
                </div>
                <button type="button" class="danger-btn" data-delete-product="${product.id}">Excluir</button>
            </li>
        `;
    }).join('');
};

const renderSettingsForm = (settings = {}) => {
    if (!settingsForm) {
        return;
    }

    const values = {
        storeName: settings.storeName || 'Dona Fome',
        phone: settings.phone || '(21) 99999-9999',
        tagline: settings.tagline || 'Sabor que dá vontade de voltar!',
        deliveryFee: settings.deliveryFee || 7.5,
        minimumOrder: settings.minimumOrder || 25,
        openingHours: settings.openingHours || 'Seg-Sex 18:00 - 23:30',
        address: settings.address || 'Niterói, RJ',
        accentColor: settings.accentColor || '#f6bb52'
    };

    Object.entries(values).forEach(([key, value]) => {
        const field = settingsForm.querySelector(`[name="${key}"]`);
        if (field) {
            field.value = value;
        }
    });
};

const loadAdminData = async () => {
    try {
        const [menuData, ordersData, statsData, settingsData] = await Promise.all([
            apiRequest('/api/menu'),
            apiRequest('/api/orders'),
            apiRequest('/api/admin/stats'),
            apiRequest('/api/settings')
        ]);

        state.categories = menuData.categories || [];
        state.products = menuData.products || [];
        state.orders = ordersData.orders || [];
        state.settings = settingsData || {};

        renderDashboardStats(statsData);
        renderCategoryOptions();
        renderCategoryList();
        renderProductsList();
        renderOrders();
        renderSettingsForm(state.settings);
    } catch (error) {
        console.error(error);
        alert(error.message || 'Não foi possível carregar o painel administrativo.');
    }
};

const checkAuth = async () => {
    try {
        const data = await apiRequest('/api/session');
        setAuthView(Boolean(data.authenticated));
        if (data.authenticated) {
            loadAdminData();
        }
    } catch (error) {
        setAuthView(false);
    }
};

if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(loginForm);
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '');

        try {
            const data = await apiRequest('/api/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });

            if (data.success) {
                setAuthView(true);
                loadAdminData();
            }
        } catch (error) {
            alert(error.message || 'Credenciais inválidas.');
        }
    });
}

if (categoryForm) {
    categoryForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = document.getElementById('category-name').value.trim();
        const icon = document.getElementById('category-icon').value.trim() || '🍽️';

        if (!name) {
            return;
        }

        try {
            await apiRequest('/api/categories', {
                method: 'POST',
                body: JSON.stringify({ name, icon })
            });

            categoryForm.reset();
            loadAdminData();
        } catch (error) {
            alert(error.message || 'Não foi possível salvar a categoria.');
        }
    });
}

if (productForm) {
    productForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = document.getElementById('product-name').value.trim();
        const category = productCategory.value;
        const description = document.getElementById('product-description').value.trim();
        const image = document.getElementById('product-image').value.trim();
        const sizes = {
            Pequeno: Number(document.getElementById('price-small').value || 0),
            Médio: Number(document.getElementById('price-medium').value || 0),
            Grande: Number(document.getElementById('price-large').value || 0)
        };

        if (!name || !category) {
            return;
        }

        try {
            await apiRequest('/api/products', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    category,
                    description,
                    image,
                    sizes
                })
            });

            productForm.reset();
            loadAdminData();
        } catch (error) {
            alert(error.message || 'Não foi possível salvar o produto.');
        }
    });
}

if (categoryList) {
    categoryList.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-delete-category]');
        if (!button) {
            return;
        }

        const { deleteCategory } = button.dataset;

        try {
            await apiRequest(`/api/categories/${deleteCategory}`, {
                method: 'DELETE'
            });
            loadAdminData();
        } catch (error) {
            alert(error.message || 'Não foi possível excluir a categoria.');
        }
    });
}

if (productList) {
    productList.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-delete-product]');
        if (!button) {
            return;
        }

        const { deleteProduct } = button.dataset;

        try {
            await apiRequest(`/api/products/${deleteProduct}`, {
                method: 'DELETE'
            });
            loadAdminData();
        } catch (error) {
            alert(error.message || 'Não foi possível excluir o produto.');
        }
    });
}

if (settingsForm) {
    settingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = Object.fromEntries(new FormData(settingsForm).entries());
        payload.deliveryFee = Number(payload.deliveryFee || 0);
        payload.minimumOrder = Number(payload.minimumOrder || 0);

        try {
            await apiRequest('/api/settings', {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            alert('Configurações salvas com sucesso!');
            loadAdminData();
        } catch (error) {
            alert(error.message || 'Não foi possível salvar as configurações.');
        }
    });
}

document.querySelectorAll('.sidebar-link[data-section]').forEach((button) => {
    button.addEventListener('click', () => setActiveSection(button.dataset.section));
});

if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            await apiRequest('/api/logout', { method: 'POST' });
            setAuthView(false);
        } catch (error) {
            console.error(error);
        }
    });
}

checkAuth();
