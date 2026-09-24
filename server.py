import json
import os
import sqlite3
import uuid
from contextlib import closing

from flask import Flask, jsonify, redirect, request, send_file
from flask_login import (
    LoginManager,
    UserMixin,
    current_user,
    login_required,
    login_user,
    logout_user,
)
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dona-fome-secret-local-2026')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['JSON_SORT_KEYS'] = False

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'home'
login_manager.session_protection = 'strong'


@login_manager.unauthorized_handler
def unauthorized_callback():
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Acesso negado.'}), 401
    return redirect('/')

DB_PATH = os.path.join(os.path.dirname(__file__), 'restaurant.db')


def slugify(value):
    value = str(value or '').strip().lower()
    value = value.replace('à', 'a').replace('á', 'a').replace('â', 'a').replace('ã', 'a')
    value = value.replace('è', 'e').replace('é', 'e').replace('ê', 'e')
    value = value.replace('ì', 'i').replace('í', 'i').replace('î', 'i')
    value = value.replace('ò', 'o').replace('ó', 'o').replace('ô', 'o').replace('õ', 'o')
    value = value.replace('ù', 'u').replace('ú', 'u').replace('û', 'u')
    value = value.replace('ç', 'c')
    value = ''.join(ch if ch.isalnum() else '-' for ch in value)
    value = '-'.join(part for part in value.split('-') if part)
    return value


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


class User(UserMixin):
    def __init__(self, user_id, username, email=None, role='CLIENTE', status='ATIVO'):
        self.id = str(user_id)
        self.username = username
        self.email = email
        self.role = role
        self.status = status

    @property
    def is_admin(self):
        return str(self.role).upper() == 'ADMIN'

    @staticmethod
    def get(user_id):
        with closing(get_db()) as conn:
            row = conn.execute(
                'SELECT id, username, email, password_hash, role, status FROM users WHERE id = ?',
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return User(row['id'], row['username'], row['email'], row['role'], row['status'])

    @staticmethod
    def get_by_username(username):
        with closing(get_db()) as conn:
            row = conn.execute(
                'SELECT id, username, email, password_hash, role, status FROM users WHERE username = ?',
                (username,),
            ).fetchone()
        if row is None:
            return None
        return row

    @staticmethod
    def get_by_email(email):
        with closing(get_db()) as conn:
            row = conn.execute(
                'SELECT id, username, email, password_hash, role, status FROM users WHERE email = ?',
                (email,),
            ).fetchone()
        if row is None:
            return None
        return row


@login_manager.user_loader
def load_user(user_id):
    return User.get(user_id)


def init_db():
    with closing(get_db()) as conn:
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                phone TEXT,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'CLIENTE',
                status TEXT NOT NULL DEFAULT 'ATIVO',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_login TEXT
            )
            '''
        )

        existing_columns = {row['name'] for row in conn.execute('PRAGMA table_info(users)').fetchall()}
        for column_name, column_sql in [
            ('email', 'TEXT'),
            ('phone', 'TEXT'),
            ('role', "TEXT NOT NULL DEFAULT 'CLIENTE'"),
            ('status', "TEXT NOT NULL DEFAULT 'ATIVO'"),
            ('last_login', 'TEXT'),
        ]:
            if column_name not in existing_columns:
                conn.execute(f'ALTER TABLE users ADD COLUMN {column_name} {column_sql}')

        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL')

        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT DEFAULT '🍽️'
            )
            '''
        )

        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                image TEXT,
                sizes_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            '''
        )

        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                customer_name TEXT NOT NULL,
                customer_phone TEXT,
                total REAL NOT NULL,
                status TEXT DEFAULT 'Novo',
                items_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            '''
        )

        order_columns = {row['name'] for row in conn.execute('PRAGMA table_info(orders)').fetchall()}
        if 'user_id' not in order_columns:
            conn.execute('ALTER TABLE orders ADD COLUMN user_id INTEGER')

        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            '''
        )

        default_settings = {
            'storeName': 'Dona Fome',
            'phone': '(21) 99999-9999',
            'tagline': 'Sabor que dá vontade de voltar!',
            'deliveryFee': '7.5',
            'minimumOrder': '25.0',
            'openingHours': 'Seg-Sex 18:00 - 23:30',
            'address': 'Niterói, RJ',
            'accentColor': '#f6bb52',
        }

        for key, value in default_settings.items():
            conn.execute(
                'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
                (key, value),
            )

        admin_username = os.environ.get('ADMIN_USERNAME', 'admin')
        admin_email = os.environ.get('ADMIN_EMAIL', 'admin@donafome.com.br')
        admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
        existing_admin = conn.execute('SELECT id FROM users WHERE username = ?', (admin_username,)).fetchone()
        if existing_admin is None:
            conn.execute(
                '''
                INSERT INTO users (username, email, password_hash, role, status)
                VALUES (?, ?, ?, 'ADMIN', 'ATIVO')
                ''',
                (admin_username, admin_email, generate_password_hash(admin_password)),
            )
        else:
            conn.execute(
                'UPDATE users SET email = ?, password_hash = ?, role = ?, status = ? WHERE username = ?',
                (admin_email, generate_password_hash(admin_password), 'ADMIN', 'ATIVO', admin_username),
            )

        default_categories = [
            ('todos', 'Mais pedidos', '★'),
            ('lanches', 'Lanches', '🍔'),
            ('porcoes', 'Porções', '🍽️'),
            ('pratos', 'Pratos', '🥘'),
            ('bebidas', 'Bebidas', '🥤'),
            ('sobremesas', 'Sobremesas', '🍰'),
            ('petiscos', 'Petiscos', '🍟'),
        ]

        for category_id, name, icon in default_categories:
            conn.execute(
                'INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?, ?, ?)',
                (category_id, name, icon),
            )

        default_products = [
            (
                'picanha-grelhada',
                'Picanha Grelhada',
                'Picanha suculenta, arroz, feijão, farofa e salada.',
                'lanches',
                'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
                json.dumps({'Pequeno': 34.9, 'Médio': 39.9, 'Grande': 49.9}, ensure_ascii=False),
            ),
            (
                'x-bacon',
                'X-Bacon',
                'Hambúrguer, queijo, bacon, alface e molho especial.',
                'lanches',
                'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
                json.dumps({'Pequeno': 22.9, 'Médio': 26.9, 'Grande': 32.9}, ensure_ascii=False),
            ),
            (
                'frango-passarinho',
                'Frango a Passarinho',
                'Crocante por fora, macio por dentro, com molho da casa.',
                'porcoes',
                'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&q=80',
                json.dumps({'Pequeno': 19.9, 'Médio': 24.9, 'Grande': 29.9}, ensure_ascii=False),
            ),
            (
                'bife-parmegiana',
                'Bife à Parmegiana',
                'Bife empanado, molho de tomate, queijo e arroz.',
                'pratos',
                'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80',
                json.dumps({'Pequeno': 26.9, 'Médio': 31.9, 'Grande': 36.9}, ensure_ascii=False),
            ),
        ]

        for product_id, name, description, category, image, sizes_json in default_products:
            conn.execute(
                'INSERT OR IGNORE INTO products (id, name, description, category, image, sizes_json) VALUES (?, ?, ?, ?, ?, ?)',
                (product_id, name, description, category, image, sizes_json),
            )

        conn.commit()


def category_to_dict(row):
    return {
        'id': row['id'],
        'name': row['name'],
        'icon': row['icon'],
    }


def product_to_dict(row):
    try:
        sizes = json.loads(row['sizes_json'] or '{}')
    except (TypeError, ValueError):
        sizes = {}

    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'],
        'category': row['category'],
        'image': row['image'],
        'sizes': sizes,
    }


def order_to_dict(row):
    try:
        items = json.loads(row['items_json'] or '[]')
    except (TypeError, ValueError):
        items = []

    summary = ', '.join(
        f"{int(item.get('quantity', 1))}x {item.get('name', 'Item')}"
        for item in items
    )

    return {
        'id': row['id'],
        'customer_name': row['customer_name'],
        'customer_phone': row['customer_phone'],
        'status': row['status'],
        'total': float(row['total'] or 0),
        'items': items,
        'items_summary': summary,
        'created_at': row['created_at'],
    }


def settings_to_dict(rows):
    settings = {}
    for row in rows:
        settings[row['key']] = row['value']
    return settings


@app.route('/')
def home():
    return send_file('index.html')


@app.route('/index.html')
def index_page():
    return send_file('index.html')


@app.route('/admin')
@app.route('/admin.html')
def admin_page():
    if not current_user.is_authenticated:
        return redirect('/')
    if not getattr(current_user, 'is_admin', False):
        return redirect('/')
    return send_file('admin.html')


def admin_required(view):
    from functools import wraps

    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or not getattr(current_user, 'is_admin', False):
            return jsonify({'success': False, 'message': 'Acesso negado.'}), 403
        return view(*args, **kwargs)

    return wrapped


@app.route('/api/session')
def api_session():
    if not current_user.is_authenticated:
        return jsonify({'authenticated': False, 'username': None, 'role': None, 'is_admin': False})

    return jsonify({
        'authenticated': True,
        'username': current_user.username,
        'role': getattr(current_user, 'role', 'CLIENTE'),
        'is_admin': getattr(current_user, 'is_admin', False),
        'email': getattr(current_user, 'email', None),
    })


@app.route('/api/register', methods=['POST'])
def api_register():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name', '')).strip()
    email = str(payload.get('email', '')).strip().lower()
    phone = str(payload.get('phone', '')).strip()
    password = str(payload.get('password', ''))
    confirm_password = str(payload.get('confirmPassword', ''))

    if not name or not email or not password:
        return jsonify({'success': False, 'message': 'Nome, e-mail e senha são obrigatórios.'}), 400

    if password != confirm_password:
        return jsonify({'success': False, 'message': 'As senhas precisam coincidir.'}), 400

    if '@' not in email:
        return jsonify({'success': False, 'message': 'Informe um e-mail válido.'}), 400

    with closing(get_db()) as conn:
        existing_email = conn.execute('SELECT 1 FROM users WHERE email = ?', (email,)).fetchone()
        if existing_email:
            return jsonify({'success': False, 'message': 'Este e-mail já está em uso.'}), 400

        username = name.strip().split()[0].lower() or 'cliente'
        base_username = username
        counter = 1
        while True:
            existing_user = conn.execute('SELECT 1 FROM users WHERE username = ?', (username,)).fetchone()
            if not existing_user:
                break
            username = f'{base_username}{counter}'
            counter += 1

        user_id = conn.execute(
            'INSERT INTO users (username, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
            (username, email, phone or None, generate_password_hash(password), 'CLIENTE', 'ATIVO'),
        ).lastrowid
        conn.commit()
        row = conn.execute('SELECT id, username, email, password_hash, role, status FROM users WHERE id = ?', (user_id,)).fetchone()

    user = User(row['id'], row['username'], row['email'], row['role'], row['status'])
    login_user(user)
    return jsonify({'success': True, 'username': user.username, 'role': user.role, 'is_admin': user.is_admin})


@app.route('/api/login', methods=['POST'])
def api_login():
    payload = request.get_json(silent=True) or {}
    username_or_email = str(payload.get('username', payload.get('email', ''))).strip().lower()
    password = str(payload.get('password', ''))

    if not username_or_email or not password:
        return jsonify({'success': False, 'message': 'Usuário/e-mail e senha são obrigatórios.'}), 400

    user_row = User.get_by_email(username_or_email)
    if user_row is None:
        user_row = User.get_by_username(username_or_email)

    if user_row is None or not check_password_hash(user_row['password_hash'], password):
        return jsonify({'success': False, 'message': 'Credenciais inválidas.'}), 401

    if user_row['status'] != 'ATIVO':
        return jsonify({'success': False, 'message': 'Sua conta está inativa.'}), 403

    user = User(user_row['id'], user_row['username'], user_row['email'], user_row['role'], user_row['status'])
    login_user(user)
    return jsonify({'success': True, 'username': user.username, 'role': user.role, 'is_admin': user.is_admin})


@app.route('/api/logout', methods=['POST'])
@login_required
def api_logout():
    logout_user()
    return jsonify({'success': True})


@app.route('/api/menu')
def api_menu():
    with closing(get_db()) as conn:
        categories = [
            category_to_dict(row)
            for row in conn.execute('SELECT * FROM categories ORDER BY name ASC').fetchall()
        ]
        products = [
            product_to_dict(row)
            for row in conn.execute('SELECT * FROM products ORDER BY name ASC').fetchall()
        ]

    return jsonify({'categories': categories, 'products': products})


@app.route('/api/categories', methods=['GET'])
@login_required
@admin_required
def api_get_categories():
    with closing(get_db()) as conn:
        rows = conn.execute('SELECT * FROM categories ORDER BY name ASC').fetchall()
    return jsonify({'categories': [category_to_dict(row) for row in rows]})


@app.route('/api/categories', methods=['POST'])
@login_required
@admin_required
def api_create_category():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name', '')).strip()
    icon = str(payload.get('icon', '🍽️')).strip() or '🍽️'

    if not name:
        return jsonify({'success': False, 'message': 'Nome da categoria é obrigatório.'}), 400

    category_id = slugify(name)
    with closing(get_db()) as conn:
        existing = conn.execute('SELECT 1 FROM categories WHERE id = ? OR name = ?', (category_id, name)).fetchone()
        if existing:
            return jsonify({'success': False, 'message': 'Categoria já existe.'}), 400

        conn.execute(
            'INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)',
            (category_id, name, icon),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM categories WHERE id = ?', (category_id,)).fetchone()

    return jsonify({'success': True, 'category': category_to_dict(row)}), 201


@app.route('/api/categories/<category_id>', methods=['DELETE'])
@login_required
@admin_required
def api_delete_category(category_id):
    with closing(get_db()) as conn:
        product_check = conn.execute('SELECT 1 FROM products WHERE category = ?', (category_id,)).fetchone()
        if product_check:
            return jsonify({'success': False, 'message': 'Existem produtos vinculados a essa categoria.'}), 400

        conn.execute('DELETE FROM categories WHERE id = ?', (category_id,))
        conn.commit()

    return jsonify({'success': True})


@app.route('/api/products', methods=['GET'])
@login_required
@admin_required
def api_get_products():
    with closing(get_db()) as conn:
        rows = conn.execute('SELECT * FROM products ORDER BY name ASC').fetchall()
    return jsonify({'products': [product_to_dict(row) for row in rows]})


@app.route('/api/products', methods=['POST'])
@login_required
@admin_required
def api_create_product():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name', '')).strip()
    category = str(payload.get('category', '')).strip()
    description = str(payload.get('description', '')).strip()
    image = str(payload.get('image', '')).strip()
    sizes = payload.get('sizes') or {}

    if not name or not category:
        return jsonify({'success': False, 'message': 'Nome do produto e categoria são obrigatórios.'}), 400

    normalized_sizes = {
        'Pequeno': float(sizes.get('Pequeno', 0) or 0),
        'Médio': float(sizes.get('Médio', 0) or 0),
        'Grande': float(sizes.get('Grande', 0) or 0),
    }

    product_id = slugify(f'{name}-{uuid.uuid4().hex[:8]}')

    with closing(get_db()) as conn:
        conn.execute(
            'INSERT INTO products (id, name, description, category, image, sizes_json) VALUES (?, ?, ?, ?, ?, ?)',
            (product_id, name, description, category, image or None, json.dumps(normalized_sizes, ensure_ascii=False)),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM products WHERE id = ?', (product_id,)).fetchone()

    return jsonify({'success': True, 'product': product_to_dict(row)}), 201


@app.route('/api/products/<product_id>', methods=['DELETE'])
@login_required
@admin_required
def api_delete_product(product_id):
    with closing(get_db()) as conn:
        conn.execute('DELETE FROM products WHERE id = ?', (product_id,))
        conn.commit()
    return jsonify({'success': True})


@app.route('/api/my-orders', methods=['GET'])
@login_required
def api_get_my_orders():
    with closing(get_db()) as conn:
        rows = conn.execute(
            'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
            (int(current_user.id),),
        ).fetchall()
    return jsonify({'orders': [order_to_dict(row) for row in rows]})


@app.route('/api/orders', methods=['GET'])
@login_required
@admin_required
def api_get_orders():
    with closing(get_db()) as conn:
        rows = conn.execute(
            'SELECT * FROM orders ORDER BY created_at DESC LIMIT 30'
        ).fetchall()
    return jsonify({'orders': [order_to_dict(row) for row in rows]})


@app.route('/api/me', methods=['GET'])
@login_required
def api_me():
    with closing(get_db()) as conn:
        user_row = conn.execute(
            'SELECT id, username, email, phone, role, status FROM users WHERE id = ?',
            (int(current_user.id),),
        ).fetchone()
        my_orders = conn.execute(
            'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
            (int(current_user.id),),
        ).fetchall()

    if user_row is None:
        return jsonify({'success': False, 'message': 'Usuário não encontrado.'}), 404

    return jsonify({
        'success': True,
        'user': {
            'id': user_row['id'],
            'username': user_row['username'],
            'email': user_row['email'],
            'phone': user_row['phone'],
            'role': user_row['role'],
            'status': user_row['status'],
        },
        'orders': [order_to_dict(row) for row in my_orders],
    })


@app.route('/api/orders', methods=['POST'])
def api_create_order():
    payload = request.get_json(silent=True) or {}
    items = payload.get('items') or []
    customer_name = str(payload.get('customerName', payload.get('customer_name', 'Cliente'))).strip() or 'Cliente'
    if current_user.is_authenticated and not customer_name or customer_name == 'Cliente':
        customer_name = current_user.username
    customer_phone = str(payload.get('customerPhone', '')).strip()

    if not items or not isinstance(items, list):
        return jsonify({'success': False, 'message': 'Itens do pedido são obrigatórios.'}), 400

    total = 0.0
    sanitized_items = []
    for item in items:
        name = str(item.get('name', 'Item')).strip() or 'Item'
        size = str(item.get('size', 'Pequeno')).strip() or 'Pequeno'
        quantity = int(item.get('quantity', 1) or 1)
        price = float(item.get('price', 0) or 0)
        total += price * quantity
        sanitized_items.append({
            'name': name,
            'size': size,
            'quantity': quantity,
            'price': price,
        })

    user_id = int(current_user.id) if current_user.is_authenticated else None

    with closing(get_db()) as conn:
        cursor = conn.execute(
            'INSERT INTO orders (user_id, customer_name, customer_phone, total, status, items_json) VALUES (?, ?, ?, ?, ?, ?)',
            (user_id, customer_name, customer_phone, total, 'Novo', json.dumps(sanitized_items, ensure_ascii=False)),
        )
        conn.commit()
        order_row = conn.execute('SELECT * FROM orders WHERE id = ?', (cursor.lastrowid,)).fetchone()

    return jsonify({'success': True, 'order': order_to_dict(order_row)}), 201


@app.route('/api/admin/stats')
@login_required
@admin_required
def api_admin_stats():
    with closing(get_db()) as conn:
        row = conn.execute(
            '''
            SELECT
                COALESCE(SUM(total), 0) AS revenue,
                COUNT(*) AS total_orders,
                COALESCE(AVG(total), 0) AS avg_total,
                COUNT(DISTINCT customer_name) AS unique_customers
            FROM orders
            WHERE date(created_at) = date('now')
            '''
        ).fetchone()

    return jsonify({
        'revenue': float(row['revenue'] or 0),
        'total_orders': int(row['total_orders'] or 0),
        'avg_total': float(row['avg_total'] or 0),
        'unique_customers': int(row['unique_customers'] or 0),
    })


@app.route('/api/settings', methods=['GET'])
@login_required
@admin_required
def api_get_settings():
    with closing(get_db()) as conn:
        rows = conn.execute('SELECT key, value FROM settings ORDER BY key ASC').fetchall()
    return jsonify(settings_to_dict(rows))


@app.route('/api/settings', methods=['PUT'])
@login_required
@admin_required
def api_update_settings():
    payload = request.get_json(silent=True) or {}
    allowed_keys = {
        'storeName',
        'phone',
        'tagline',
        'deliveryFee',
        'minimumOrder',
        'openingHours',
        'address',
        'accentColor',
    }

    updates = {}
    for key, value in payload.items():
        if key in allowed_keys:
            updates[key] = str(value)

    if not updates:
        return jsonify({'success': False, 'message': 'Nenhuma configuração válida foi enviada.'}), 400

    with closing(get_db()) as conn:
        for key, value in updates.items():
            conn.execute(
                'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
                (key, value),
            )
        conn.commit()

    return jsonify({'success': True, 'settings': updates})


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=8000, debug=False)
