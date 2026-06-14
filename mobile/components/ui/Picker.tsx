import React, { useState } from 'react';
import { Modal, View, Text, Pressable, FlatList, SafeAreaView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface PickerOption {
  label: string;
  value: string;
}

interface PickerProps {
  label?: string;
  options: PickerOption[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function Picker({ label, options, selectedValue, onValueChange, placeholder = 'Select an option' }: PickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const selectedOption = options.find(opt => opt.value === selectedValue);

  return (
    <View className="space-y-1.5 flex-1">
      {label && <Text className="text-slate-700 text-xs font-bold mb-1">{label}</Text>}
      <Pressable
        onPress={() => setModalVisible(true)}
        className="flex-row justify-between items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5"
      >
        <Text className={`text-sm ${selectedOption ? 'text-slate-800 font-medium' : 'text-slate-400'}`} numberOfLines={1}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Feather name="chevron-down" size={18} color="#64748B" />
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl max-h-[70%]">
            <SafeAreaView className="p-5">
              <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-slate-100">
                <Text className="text-base font-bold text-slate-800">{placeholder}</Text>
                <Pressable onPress={() => setModalVisible(false)} className="p-1">
                  <Feather name="x" size={20} color="#64748B" />
                </Pressable>
              </View>

              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => {
                  const isSelected = item.value === selectedValue;
                  return (
                    <Pressable
                      onPress={() => {
                        onValueChange(item.value);
                        setModalVisible(false);
                      }}
                      className={`flex-row justify-between items-center p-4 rounded-xl mb-2 ${
                        isSelected ? 'bg-emerald-50' : 'active:bg-slate-50'
                      }`}
                    >
                      <Text className={`text-sm ${isSelected ? 'text-emerald-700 font-bold' : 'text-slate-700'}`}>
                        {item.label}
                      </Text>
                      {isSelected && <Feather name="check" size={18} color="#10B981" />}
                    </Pressable>
                  );
                }}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
