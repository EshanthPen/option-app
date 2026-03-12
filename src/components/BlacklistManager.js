import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Plus, X, Globe } from 'lucide-react-native';

export default function BlacklistManager({ blacklist, onAdd, onRemove }) {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const [input, setInput] = useState('');

    const handleAdd = () => {
        const domain = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (domain && !blacklist.includes(domain)) {
            onAdd(domain);
            setInput('');
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.domainItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Globe size={14} color={theme.colors.ink3} />
                <Text style={styles.domainText}>{item}</Text>
            </View>
            <TouchableOpacity onPress={() => onRemove(item)} style={styles.deleteBtn}>
                <X size={16} color={theme.colors.red} />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>Blocked Websites</Text>
                <Text style={styles.countBadge}>{blacklist.length}</Text>
            </View>
            <Text style={styles.subtitle}>These sites will be blocked during your work sessions.</Text>

            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. reddit.com"
                    placeholderTextColor={theme.colors.ink3}
                    value={input}
                    onChangeText={setInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={handleAdd}
                />
                <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
                    <Plus size={20} color="#fff" />
                    <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
            </View>

            {blacklist.length > 0 ? (
                <View style={styles.listContainer}>
                    {blacklist.map((item, index) => (
                        <React.Fragment key={item}>
                            {renderItem({ item })}
                            {index < blacklist.length - 1 && <View style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </View>
            ) : (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No websites blocked yet.</Text>
                </View>
            )}
        </View>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: {
        backgroundColor: theme.colors.surface,
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.lg,
        padding: 20,
        marginBottom: 16,
        shadowColor: theme.colors.border,
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 4
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    title: { fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink },
    countBadge: { backgroundColor: theme.colors.surface2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, overflow: 'hidden' },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },

    inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    input: { flex: 1, height: 44, borderWidth: 2, borderColor: theme.colors.border, borderRadius: theme.radii.m, paddingHorizontal: 12, fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink, backgroundColor: theme.colors.bg },
    addBtn: { backgroundColor: theme.colors.ink, height: 44, paddingHorizontal: 16, borderRadius: theme.radii.m, flexDirection: 'row', alignItems: 'center', gap: 6 },
    addBtnText: { color: '#fff', fontFamily: theme.fonts.b, fontSize: 14, letterSpacing: 0.5 },

    listContainer: {
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderRadius: theme.radii.m,
        backgroundColor: theme.colors.bg,
        overflow: 'hidden'
    },
    domainItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14 },
    domainText: { fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink },
    deleteBtn: { padding: 4 },
    divider: { height: 2, backgroundColor: theme.colors.border },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, borderWidth: 2, borderColor: theme.colors.border, borderRadius: theme.radii.m, borderStyle: 'dashed' },
    emptyText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 },
});
