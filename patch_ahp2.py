import re

with open("src/components/mcda/AHPComparison.tsx", "r") as f:
    text = f.read()

# We need to extract the parts and re-assemble them.
# The table block: starts at <div className="overflow-x-auto"> and goes to the closing </div>
# The graph block: starts at <div className="flex justify-center... relative min-h-[300px]"> and goes to its closing </div>

# Actually, let's just do Python regexes to find the exact blocks.
idx_view_content = text.find("{/* View Content */}")

# we will rebuild the bottom part manually using replace_string_in_file

