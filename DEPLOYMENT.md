# Deployment Guide

## NAS Deployment

The Recipe Planner frontend is deployed on the local NAS (OpenMediaVault).

### Access

- **URL**: http://192.168.50.95:3000/
- **PocketBase (Production)**: http://192.168.50.95:8090/
- **PocketBase (Test)**: http://192.168.50.95:8091/

### Server Details

- **Host**: 192.168.50.95 (openmediavault)
- **User**: nasadmin
- **SSH**: `ssh nas` (configured in ~/.ssh/config)

### File Locations

```
/srv/dev-disk-by-uuid-6ba0fcd6-7c5b-48eb-8f78-30d953f694fd/appdata/recipe-planner/
├── recipe-planner/          # Frontend app
│   ├── dist/                # Built production files
│   ├── src/                 # Source code
│   └── ...
├── examples/                # Recipe import examples
├── RECIPE-IMPORT-GUIDE.md   # Guide for importing recipes
└── ...
```

### Service Management

The app runs as a user-level systemd service under the `nasadmin` account.

```bash
# Check status
ssh nas "systemctl --user status recipe-planner"

# Restart service
ssh nas "systemctl --user restart recipe-planner"

# Stop service
ssh nas "systemctl --user stop recipe-planner"

# View logs
ssh nas "journalctl --user -u recipe-planner -f"
```

### Updating the Deployment

To deploy updates:

```bash
# SSH to NAS and pull latest changes
ssh nas "cd /srv/dev-disk-by-uuid-6ba0fcd6-7c5b-48eb-8f78-30d953f694fd/appdata/recipe-planner && git pull"

# Rebuild (requires nvm for Node 22)
ssh nas "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && cd /srv/dev-disk-by-uuid-6ba0fcd6-7c5b-48eb-8f78-30d953f694fd/appdata/recipe-planner/recipe-planner && npm install && npm run build"

# Restart the service
ssh nas "systemctl --user restart recipe-planner"
```

### Technical Details

- **Node Version**: 22.x (managed via nvm)
- **Web Server**: `serve` (npm package) serving static files
- **Port**: 3000
- **Service File**: `~/.config/systemd/user/recipe-planner.service`

### Initial Setup (Reference)

These steps were used for initial deployment:

1. **SSH Key Setup**
   ```bash
   # Copy public key to NAS
   cat ~/.ssh/id_rsa.pub | pbcopy
   # Then on NAS: cat >> ~/.ssh/authorized_keys
   ```

2. **Install nvm and Node 22**
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.nvm/nvm.sh
   nvm install 22
   ```

3. **Clone and Build**
   ```bash
   cd /srv/dev-disk-by-uuid-6ba0fcd6-7c5b-48eb-8f78-30d953f694fd/appdata
   mkdir recipe-planner && cd recipe-planner
   git clone https://github.com/elliottabirch/RecipePlanner.git .
   cd recipe-planner
   npm install
   npm run build
   ```

4. **Install serve**
   ```bash
   npm install -g serve
   ```

5. **Create systemd user service**
   ```bash
   mkdir -p ~/.config/systemd/user
   cat > ~/.config/systemd/user/recipe-planner.service << 'EOF'
   [Unit]
   Description=Recipe Planner Web App
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/srv/dev-disk-by-uuid-6ba0fcd6-7c5b-48eb-8f78-30d953f694fd/appdata/recipe-planner/recipe-planner
   Environment=NVM_DIR=/home/nasadmin/.nvm
   ExecStart=/bin/bash -c 'source $NVM_DIR/nvm.sh && serve -s dist -l 3000'
   Restart=on-failure
   RestartSec=10

   [Install]
   WantedBy=default.target
   EOF
   ```

6. **Enable and start**
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable recipe-planner
   systemctl --user start recipe-planner
   loginctl enable-linger nasadmin  # Persist after logout
   ```
