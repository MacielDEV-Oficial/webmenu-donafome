const STORAGE_KEY = 'donaFomeCart';
const state = {
    activeCategory: 'todos',
    categories: [],
    products: []
};

const cart = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
}).format(Number(value || 0));

const normalizeSizeKey = (value) => {
    if (!value) return 'Pequeno';
    const trimmed = String(value).trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const saveCart = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
};

const cartButton = document.getElementById('cart-button');
const cartOverlay = document.getElementById('cart-overlay');
const closeCartButton = document.getElementById('close-cart');
const confirmButton = document.getElementById('confirm-btn');
const categoryStrip = document.getElementById('category-strip');
const categoryGrid = document.getElementById('category-grid');
const dishGrid = document.getElementById('dish-grid');
const accountButton = document.getElementById('account-button');
const accountMenu = document.getElementById('account-menu');
const authModal = document.getElementById('auth-modal');
const authCloseButton = document.getElementById('auth-close');
const authLoginForm = document.getElementById('auth-login-form');
const authRegisterForm = document.getElementById('auth-register-form');
const authModeButtons = document.querySelectorAll('.auth-toggle-btn');
const accountPanel = document.getElementById('account-panel');
const accountPanelClose = document.getElementById('account-panel-close');
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profileAvatar = document.getElementById('profile-avatar');
const accountUsername = document.getElementById('account-username');
const accountEmail = document.getElementById('account-email');
const accountPhone = document.getElementById('account-phone');
const customerOrders = document.getElementById('customer-orders');
let modalScrollLockCount = 0;

const setGlobalScrollLock = (locked) => {
    if (locked) {
        modalScrollLockCount += 1;
    } else {
        modalScrollLockCount = Math.max(0, modalScrollLockCount - 1);
    }

    const shouldLock = modalScrollLockCount > 0;
    document.body.style.overflow = shouldLock ? 'hidden' : '';
    document.documentElement.style.overflow = shouldLock ? 'hidden' : '';
};

const setAuthMode = (mode) => {
    const targetMode = mode === 'register' ? 'register' : 'login';

    authModeButtons.forEach((button) => {
        const isActive = button.dataset.authMode === targetMode;
        button.classList.toggle('active', isActive);
    });

    if (authLoginForm) {
        authLoginForm.classList.toggle('hidden', targetMode !== 'login');
    }

    if (authRegisterForm) {
        authRegisterForm.classList.toggle('hidden', targetMode !== 'register');
    }
};

const openAuthModal = (mode = 'login') => {
    if (authModal) {
        authModal.classList.remove('hidden');
        setGlobalScrollLock(true);
        setAuthMode(mode);
    }
};

const closeAuthModal = () => {
    if (authModal) {
        authModal.classList.add('hidden');
        setGlobalScrollLock(false);
    }
};

const openAccountPanel = async () => {
    if (!accountPanel) {
        return;
    }

    setGlobalScrollLock(true);

    try {
        const response = await fetch('/api/me');
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Não foi possível carregar sua conta.');
        }

        const user = result.user || {};
        const name = user.username || 'Cliente';
        const email = user.email || 'cliente@email.com';
        const phone = user.phone || 'Não informado';

        if (profileName) profileName.textContent = name;
        if (profileEmail) profileEmail.textContent = email;
        if (profileAvatar) profileAvatar.textContent = name.charAt(0).toUpperCase();
        if (accountUsername) accountUsername.textContent = user.username || '-';
        if (accountEmail) accountEmail.textContent = email;
        if (accountPhone) accountPhone.textContent = phone;

        if (customerOrders) {
            const orders = Array.isArray(result.orders) ? result.orders : [];
            if (!orders.length) {
                customerOrders.innerHTML = '<div class="empty-cart"><p>Ainda não há pedidos realizados.</p></div>';
                return;
            }

            customerOrders.innerHTML = orders.map((order) => {
                const itemsText = (order.items || []).map((item) => `${item.quantity}x ${item.name}${item.size ? ` • ${item.size}` : ''}`).join('<br>');
                const createdAt = order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : 'Hoje';
                return `
                    <div class="customer-order-item">
                        <div class="customer-order-top">
                            <strong>#${order.id}</strong>
                            <span>${order.status || 'Novo'}</span>
                        </div>
                        <div class="customer-order-meta">
                            <span>${createdAt}</span>
                            <strong>${formatCurrency(order.total || 0)}</strong>
                        </div>
                        <div class="customer-order-items">${itemsText}</div>
                    </div>
                `;
            }).join('');
        }

        accountPanel.classList.remove('hidden');
    } catch (error) {
        console.error(error);
        openAuthModal('login');
    }
};

const closeAccountPanel = () => {
    if (accountPanel) {
        accountPanel.classList.add('hidden');
        setGlobalScrollLock(false);
    }
};

const updateAccountMenu = async () => {
    if (!accountMenu) {
        return;
    }

    try {
        const response = await fetch('/api/session');
        const data = await response.json();

        if (!data.authenticated) {
            accountMenu.innerHTML = '<button type="button" data-account-action="login">Entrar</button>';
            return;
        }

        const adminLink = data.is_admin ? '<a href="/admin">Painel admin</a>' : '';
        accountMenu.innerHTML = `
            <div style="padding:8px 12px 10px;color:#f7e7c9;font-weight:700;">Olá, ${data.username}</div>
            <button type="button" data-account-action="account">Minha conta</button>
            ${adminLink}
            <button type="button" data-account-action="logout">Sair</button>
        `;
    } catch (error) {
        accountMenu.innerHTML = '<button type="button" data-account-action="login">Entrar</button>';
    }
};

const openCart = () => {
    if (cartOverlay) {
        cartOverlay.classList.remove('hidden');
    }
};

const closeCart = () => {
    if (cartOverlay) {
        cartOverlay.classList.add('hidden');
    }
};

const updateCartSummary = () => {
    const cartCount = document.getElementById('cart-count');
    const badge = document.getElementById('cart-badge');
    const itemQuantity = document.getElementById('item-quantity');
    const subtotalEl = document.getElementById('subtotal');
    const totalEl = document.getElementById('total');

    const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

    if (cartCount) {
        cartCount.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'itens'}`;
    }

    if (badge) {
        badge.textContent = totalItems;
    }

    if (itemQuantity) {
        itemQuantity.textContent = totalItems;
    }

    if (subtotalEl) {
        subtotalEl.textContent = formatCurrency(subtotal);
    }

    if (totalEl) {
        totalEl.textContent = formatCurrency(subtotal);
    }
};

const renderCart = () => {
    const cartItems = document.getElementById('cart-items');

    if (!cartItems) {
        return;
    }

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <p>Nenhum item adicionado ainda.</p>
            </div>
        `;
        updateCartSummary();
        return;
    }

    cartItems.innerHTML = cart.map((item) => `
        <div class="cart-item">
            <div class="cart-item-top">
                <div>
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-size">${item.size}</div>
                </div>
                <div class="cart-item-price">${formatCurrency(item.price * item.quantity)}</div>
            </div>
            <div class="cart-item-bottom">
                <span>Qtd: ${item.quantity}</span>
                <span>${formatCurrency(item.price)} cada</span>
            </div>
        </div>
    `).join('');

    updateCartSummary();
};

const renderCategoryStrip = () => {
    if (!categoryStrip) {
        return;
    }

    categoryStrip.innerHTML = state.categories.map((category) => `
        <button
            type="button"
            class="category-item ${state.activeCategory === category.id ? 'active' : ''}"
            data-category-id="${category.id}"
        >
            <span class="icon">${category.icon || '🍽️'}</span>
            <span>${category.name}</span>
        </button>
    `).join('');

    categoryStrip.querySelectorAll('.category-item').forEach((button) => {
        button.addEventListener('click', () => {
            state.activeCategory = button.dataset.categoryId;
            renderCategoryStrip();
            renderProducts();
        });
    });
};

const renderCategoryCards = () => {
    if (!categoryGrid) {
        return;
    }

    const cards = state.categories.filter((category) => category.id !== 'todos');

    categoryGrid.innerHTML = cards.map((category, index) => `
        <button type="button" class="mini-category-card" data-category-id="${category.id}">
            <div class="mini-thumb thumb-${index + 1}">${category.icon || '🍽️'}</div>
            <div class="mini-card-text">${category.name}</div>
            <span>›</span>
        </button>
    `).join('');

    categoryGrid.querySelectorAll('.mini-category-card').forEach((button) => {
        button.addEventListener('click', () => {
            state.activeCategory = button.dataset.categoryId;
            renderCategoryStrip();
            renderProducts();
            document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
        });
    });
};

const productImages = {
    lanches: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    porcoes: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80',
    pratos: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80',
    bebidas: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=800&q=80',
    sobremesas: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=800&q=80'
};

const renderProducts = () => {
    if (!dishGrid) {
        return;
    }

    const visibleProducts = state.activeCategory === 'todos'
        ? state.products
        : state.products.filter((product) => product.category === state.activeCategory);

    if (!visibleProducts.length) {
        dishGrid.innerHTML = `
            <div class="empty-product-state">
                <p>Nenhum produto cadastrado nesta categoria.</p>
            </div>
        `;
        return;
    }

    dishGrid.innerHTML = visibleProducts.map((product) => {
        const sizes = product.sizes && typeof product.sizes === 'object' ? product.sizes : { Pequeno: 0, Médio: 0, Grande: 0 };
        const sizesString = JSON.stringify(sizes).replace(/"/g, '&quot;');
        const defaultSize = Object.keys(sizes)[0] || 'Pequeno';
        const initialPrice = Number(sizes[defaultSize] || 0);

        return `
            <article class="dish-card" data-name="${product.name}" data-sizes='${sizesString}' data-product-id="${product.id}">
                <div class="dish-image" style="background-image: url('${product.image || productImages[product.category] || productImages.default}')"></div>
                <div class="dish-body">
                    <div class="dish-header">
                        <div>
                            <h3>${product.name}</h3>
                            <p>${product.description || 'Delicioso e preparado com carinho.'}</p>
                        </div>
                    </div>

                    <div class="dish-controls">
                        <div class="size-group">
                            ${Object.keys(sizes).map((size) => `
                                <button type="button" class="size-option ${size === defaultSize ? 'selected' : ''}" data-size="${size}">${size === 'Pequeno' ? 'P' : size === 'Médio' ? 'M' : size === 'Grande' ? 'G' : size.charAt(0).toUpperCase()}</button>
                            `).join('')}
                        </div>
                        <div class="qty-box">
                            <button type="button" class="qty-btn minus" aria-label="Diminuir quantidade">-</button>
                            <span class="qty-value">1</span>
                            <button type="button" class="qty-btn plus" aria-label="Aumentar quantidade">+</button>
                        </div>
                    </div>

                    <div class="dish-footer">
                        <div class="price-block">
                            <span>Preço</span>
                            <strong class="item-price">${formatCurrency(initialPrice)}</strong>
                        </div>
                        <button type="button" class="add-btn">Adicionar</button>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    document.querySelectorAll('.dish-card').forEach((card) => setupDishCard(card));
};

const setupDishCard = (card) => {
    const name = card.dataset.name;
    const sizeMap = JSON.parse(card.dataset.sizes?.replace(/&quot;/g, '"') || '{}');
    const sizeButtons = [...card.querySelectorAll('.size-option')];
    const qtyValue = card.querySelector('.qty-value');
    const priceValue = card.querySelector('.item-price');
    const addButton = card.querySelector('.add-btn');
    const minusBtn = card.querySelector('.minus');
    const plusBtn = card.querySelector('.plus');

    let quantity = 1;
    let selectedSize = sizeButtons[0]?.dataset.size || 'Pequeno';

    const updatePrice = () => {
        const unitPrice = Number(sizeMap[selectedSize] ?? 0);
        priceValue.textContent = formatCurrency(unitPrice * quantity);
    };

    sizeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            selectedSize = button.dataset.size;
            sizeButtons.forEach((btn) => btn.classList.toggle('selected', btn === button));
            updatePrice();
        });
    });

    minusBtn.addEventListener('click', () => {
        if (quantity > 1) {
            quantity -= 1;
            qtyValue.textContent = quantity;
            updatePrice();
        }
    });

    plusBtn.addEventListener('click', () => {
        quantity += 1;
        qtyValue.textContent = quantity;
        updatePrice();
    });

    addButton.addEventListener('click', () => {
        const readablePrice = Number(sizeMap[selectedSize] || 0);
        const normalizedSize = normalizeSizeKey(selectedSize) || 'Pequeno';
        const existingItem = cart.find((item) => item.name === name && item.size === normalizedSize);

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.push({
                name,
                size: normalizedSize,
                quantity,
                price: readablePrice,
            });
        }

        saveCart();
        renderCart();
    });
};

const loadMenu = async () => {
    try {
        const response = await fetch('/api/menu');
        if (!response.ok) {
            throw new Error('Erro ao carregar menu');
        }

        const data = await response.json();
        state.categories = data.categories || [];
        state.products = data.products || [];

        if (!state.categories.some((category) => category.id === state.activeCategory)) {
            state.activeCategory = 'todos';
        }

        renderCategoryStrip();
        renderCategoryCards();
        renderProducts();
    } catch (error) {
        console.error(error);
    }
};

const handleCheckout = async () => {
    if (!cart.length) {
        closeCart();
        return;
    }

    const customerName = window.prompt('Qual é o seu nome para o pedido?', 'Cliente') || 'Cliente';
    const customerPhone = window.prompt('Telefone para contato (opcional):', '') || '';

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customerName,
                customerPhone,
                items: cart.map((item) => ({
                    name: item.name,
                    size: item.size,
                    quantity: item.quantity,
                    price: Number(item.price || 0)
                }))
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Erro ao finalizar pedido');
        }

        cart.length = 0;
        saveCart();
        renderCart();
        closeCart();
        window.alert(`Pedido ${result.order.id} confirmado com sucesso!`);
    } catch (error) {
        console.error(error);
        window.alert(error.message || 'Não foi possível finalizar o pedido.');
    }
};

if (cartButton) {
    cartButton.addEventListener('click', openCart);
}

if (closeCartButton) {
    closeCartButton.addEventListener('click', closeCart);
}

if (cartOverlay) {
    cartOverlay.addEventListener('click', (event) => {
        if (event.target === cartOverlay) {
            closeCart();
        }
    });
}

if (confirmButton) {
    confirmButton.addEventListener('click', handleCheckout);
}

if (accountButton) {
    accountButton.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/session');
            const data = await response.json();

            if (!data.authenticated) {
                accountMenu?.classList.add('hidden');
                openAuthModal('login');
                return;
            }

            accountMenu?.classList.toggle('hidden');
            await updateAccountMenu();
            accountMenu?.classList.remove('hidden');
        } catch (error) {
            openAuthModal('login');
        }
    });
}

if (accountMenu) {
    accountMenu.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-account-action]')?.dataset.accountAction;

        if (action === 'login') {
            accountMenu.classList.add('hidden');
            openAuthModal('login');
            return;
        }

        if (action === 'account') {
            accountMenu.classList.add('hidden');
            await openAccountPanel();
            return;
        }

        if (action === 'logout') {
            try {
                await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                accountMenu.classList.add('hidden');
                closeAccountPanel();
                await updateAccountMenu();
            } catch (error) {
                console.error(error);
            }
        }
    });
}

if (authCloseButton) {
    authCloseButton.addEventListener('click', closeAuthModal);
}

if (accountPanelClose) {
    accountPanelClose.addEventListener('click', closeAccountPanel);
}

if (accountPanel) {
    accountPanel.addEventListener('click', (event) => {
        if (event.target === accountPanel) {
            closeAccountPanel();
        }
    });
}

if (authModal) {
    authModal.addEventListener('click', (event) => {
        if (event.target === authModal) {
            closeAuthModal();
        }
    });
}

authModeButtons.forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
});

if (authLoginForm) {
    authLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(authLoginForm);
        const payload = {
            username: String(formData.get('username') || '').trim(),
            password: String(formData.get('password') || '')
        };

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Credenciais inválidas.');
            }

            closeAuthModal();
            await updateAccountMenu();
            await openAccountPanel();
        } catch (error) {
            window.alert(error.message || 'Não foi possível entrar.');
        }
    });
}

if (authRegisterForm) {
    authRegisterForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(authRegisterForm);
        const payload = {
            name: String(formData.get('name') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            phone: String(formData.get('phone') || '').trim(),
            password: String(formData.get('password') || ''),
            confirmPassword: String(formData.get('confirmPassword') || '')
        };

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Não foi possível criar a conta.');
            }

            closeAuthModal();
            await updateAccountMenu();
            await openAccountPanel();
        } catch (error) {
            window.alert(error.message || 'Não foi possível criar a conta.');
        }
    });
}

renderCart();
updateAccountMenu();
loadMenu();
