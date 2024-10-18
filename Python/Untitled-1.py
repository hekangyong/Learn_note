# x = int (input("please enter an integer: "))
# if x < 0:
#     x = 0
#     print('Negative changed to zero')
# elif x == 0:
#     print('Zero')
# elif x == 1:
#     print('Single')
# else:
#     print('More')

# word = ['cat', 'window', 'defenestrate']

# for w in word:
#     print(w, len(w))

users = {'Hans': 'active', 'Éléonore': 'inactive', '景太郎': 'active'}

print(users.items())
for user, status in users.copy().items():
    print(user, status)
    if status == 'inactive':
        del users[user]
    
active_users = {}

for user, status in users.items():
    if status == 'active':
        active_users[user] = status