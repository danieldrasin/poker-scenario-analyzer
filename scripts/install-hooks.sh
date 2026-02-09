#!/bin/bash
# Install git hooks for the poker-simulator project
# Run this after cloning: ./scripts/install-hooks.sh

HOOK_DIR=".git/hooks"

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo "Error: Not in a git repository root"
    exit 1
fi

# Create pre-push hook
cat > "$HOOK_DIR/pre-push" << 'HOOK'
#!/bin/bash
# Pre-push hook: validates build before allowing push

echo "🔍 Running build check before push..."

# Run the build
if ! npm run build > /tmp/build-output.txt 2>&1; then
    echo ""
    echo "❌ BUILD FAILED - Push aborted!"
    echo ""
    echo "Fix these errors before pushing:"
    cat /tmp/build-output.txt
    exit 1
fi

echo "✅ Build passed!"
exit 0
HOOK

chmod +x "$HOOK_DIR/pre-push"

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-push hook will now:"
echo "  • Run 'npm run build' before each push"
echo "  • Block the push if the build fails"
