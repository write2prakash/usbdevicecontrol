# GitHub Actions AWS Deployment Setup

## Overview
This guide explains how to set up automatic deployment to your AWS instance when you push code to GitHub.

## Prerequisites
- AWS Instance: `52.66.212.250`
- Username: `ubuntu`
- SSH key has been generated

## Setup Steps

### 1. Add SSH Public Key to AWS Instance

**SSH Public Key:**
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDITbcw2rEijDRY5YRHmF8oD/P5hG4M3denT1/n9yKTMZ6Ll1vtyeZ8TaKek6DuowgbSSrx28q9AxTq5peJhVuNJVsWPQ8xXHG+c65Nd0MZQ4GjEWWE6TF6lnfCPXzi/KMl8cruqU6CjSWCHqdSnfio43G9HSJ9iO+cfgzM/J7RYbwhSNyJCsiTLyx4Tv41JvahLgMM5evnenzY6TVcyQ5nCa3WeFW9D/xOiVa9Ujfue2e3lw4eY2hLGG/WvDFubliuEO48lr4y3Cbg2fkrMlHfmpCfzufm1OPInfE5oK0URlVOxJ0OWA6y7e3qEBIrzu+iqiIWjMnjnued1MQxdGPBut7fR4rL0coNl7A1VzmLP1C86ksiDydVh8Fb/vOzNjd0m1ja13JT986GI73zZvGn+TRgSs7mzJ6wQk2qjiGLHZpMrKUGs+MVrR7UAy9GzKkED+QFVzwz8O5iCG+xBWQTAoBiIROqAsk9ne4K/oqP7cebiSU8tokvDFBYwFmQYFzjEsQw7NfALiyRlrkNgjKV7oT6s1xvOa1vq2swm3kDkIGJTDpflqDBRSOT/MF+8i2xCMTLVYTkX4pTVMiO4KRDENGSC6J/RJrtYr1XSqh69Le2RUJCBzqzZa/QF29BUSfv8583VsADw6OxZm81sGkFJv//d+oi50z4deuwneit9Q== prakash@DESKTOP-MCFJ6B5
```

**To add the key to your AWS instance:**

```bash
# SSH into your AWS instance
ssh -i /path/to/your/pem/key ubuntu@52.66.212.250

# Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh

# Add the public key to authorized_keys
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDITbcw2rEijDRY5YRHmF8oD/P5hG4M3denT1/n9yKTMZ6Ll1vtyeZ8TaKek6DuowgbSSrx28q9AxTq5peJhVuNJVsWPQ8xXHG+c65Nd0MZQ4GjEWWE6TF6lnfCPXzi/KMl8cruqU6CjSWCHqdSnfio43G9HSJ9iO+cfgzM/J7RYbwhSNyJCsiTLyx4Tv41JvahLgMM5evnenzY6TVcyQ5nCa3WeFW9D/xOiVa9Ujfue2e3lw4eY2hLGG/WvDFubliuEO48lr4y3Cbg2fkrMlHfmpCfzufm1OPInfE5oK0URlVOxJ0OWA6y7e3qEBIrzu+iqiIWjMnjnued1MQxdGPBut7fR4rL0coNl7A1VzmLP1C86ksiDydVh8Fb/vOzNjd0m1ja13JT986GI73zZvGn+TRgSs7mzJ6wQk2qjiGLHZpMrKUGs+MVrR7UAy9GzKkED+QFVzwz8O5iCG+xBWQTAoBiIROqAsk9ne4K/oqP7cebiSU8tokvDFBYwFmQYFzjEsQw7NfALiyRlrkNgjKV7oT6s1xvOa1vq2swm3kDkIGJTDpflqDBRSOT/MF+8i2xCMTLVYTkX4pTVMiO4KRDENGSC6J/RJrtYr1XSqh69Le2RUJCBzqzZa/QF29BUSfv8583VsADw6OxZm81sGkFJv//d+oi50z4deuwneit9Q== prakash@DESKTOP-MCFJ6B5" >> ~/.ssh/authorized_keys

# Set proper permissions
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### 2. Add GitHub Secrets

Go to your GitHub repository settings and add these secrets:

**Location:** Settings → Secrets and variables → Actions → New repository secret

1. **AWS_HOST**
   - Value: `52.66.212.250`

2. **AWS_USERNAME**
   - Value: `ubuntu`

3. **AWS_SSH_PRIVATE_KEY**
   - Value: Copy the contents of `$env:TEMP\github_deploy_key` (the private key)
   - **Important:** Keep this secret safe and never share it!

> Note: GitHub no longer allows password authentication for Git operations over HTTPS. Use the SSH key secret here instead of a password.

### 3. Verify Setup

1. Commit and push a change to your main branch
2. Go to your GitHub repository's Actions tab
3. You should see the "Deploy to AWS" workflow running
4. Check the logs to verify successful deployment

## How It Works

When you push code to the `main` branch:
1. GitHub Actions triggers the deployment workflow
2. It SSHes into your AWS instance using the stored credentials
3. It pulls the latest code from your GitHub repository
4. It runs `docker-compose` to update and restart the services

## Troubleshooting

- **SSH connection fails**: Verify the public key is correctly added to `~/.ssh/authorized_keys` on the AWS instance
- **Permission denied**: Check that `/home/ubuntu/.ssh/authorized_keys` has correct permissions (600)
- **Docker-compose not found**: Make sure Docker and Docker Compose are installed on the AWS instance

## Testing SSH Connection Locally

```bash
# Copy private key to a safe location
cp $env:TEMP\github_deploy_key ~/.ssh/github_deploy_key
chmod 600 ~/.ssh/github_deploy_key

# Test SSH connection
ssh -i ~/.ssh/github_deploy_key ubuntu@52.66.212.250
```
